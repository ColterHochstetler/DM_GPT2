import React, { useState, useRef, useMemo, useEffect, useCallback } from "react";
import { v4 as uuidv4 } from 'uuid';
import { IntlShape, useIntl } from "react-intl";
import { Backend, User } from "./backend";
import { ChatManager } from "./";
import { useAppDispatch } from "../store";
import { openOpenAIApiKeyPanel } from "../store/settings-ui";
import { Message, Parameters, UserSubmittedMessage } from "./chat/types";
import { useChat, UseChatResult } from "./chat/use-chat";
import { TTSContextProvider } from "./tts/use-tts";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { isProxySupported } from "./chat/openai";
import { audioContext, resetAudioContext } from "./tts/audio-file-player";

export interface Context {
    authenticated: boolean;
    sessionExpired: boolean;
    chat: ChatManager;
    user: User | null;
    intl: IntlShape;
    id: string | undefined | null;
    currentChat: UseChatResult;
    isHome: boolean;
    isShare: boolean;
    generating: boolean;
    onNewMessage: (message?: string) => Promise<string | false>;
    regenerateMessage: (message: Message) => Promise<boolean>;
    editMessage: (message: Message, content: string) => Promise<boolean>;
}

const AppContext = React.createContext<Context>({} as any);

const chatManager = new ChatManager();
const backend = new Backend(chatManager);

let intl: IntlShape;

// AGENTS: Handles communication to LLMs 
// 
abstract class Agent<T> {
    protected chatManager: ChatManager;

    constructor(chatManager: ChatManager) {
        this.chatManager = chatManager;
    }

    abstract preprocessMessage(message: string): string;
    abstract postprocessMessage(response: any): any;

    sendMessage(
        chatID: string, 
        message: string, 
        parameters: Parameters, 
        currentChatLeafId?: string | undefined, 
        shouldPublish: boolean = true,
        postprocessCallback?: (response: any) => any 
    ): void {
        const processedMessage = this.preprocessMessage(message);
        
        this.chatManager.sendMessage({
            chatID: chatID,
            content: processedMessage.trim(),
            requestedParameters: parameters,
            parentID: currentChatLeafId
        }, shouldPublish, postprocessCallback);
    }    
}

// Streams content to chat
class StreamingAgent extends Agent<any> {
    preprocessMessage(message: string): string {
        return message; // You can modify this if the StreamingAgent has a different preprocessing logic
    }

    postprocessMessage(response: any): any {
        return response; // Similarly, modify this if the StreamingAgent has a different postprocessing logic
    }

    // If there's any additional logic specific to StreamingAgent, you can override the sendMessage method here.
    // Otherwise, you can omit it, and the base class's sendMessage method will be used.
}

// Gets content from an LLM and runs functions on it. Not shown to user.
class PostProcessingAgent extends Agent<any> {
    preprocessMessage(message: string): string {
        return message; // You can modify this if the StreamingAgent has a different preprocessing logic
    }

    postprocessMessage(response: any): any {
        return response; // Similarly, modify this if the StreamingAgent has a different postprocessing logic
    }

    // If there's any additional logic specific to StreamingAgent, you can override the sendMessage method here.
    // Otherwise, you can omit it, and the base class's sendMessage method will be used.
}


export function useCreateAppContext(): Context {
    const { id: _id } = useParams();
    const [nextID, setNextID] = useState(uuidv4());
    const id = _id ?? nextID;

    const dispatch = useAppDispatch();

    intl = useIntl();
    
    const { pathname } = useLocation();
    const isHome = pathname === '/';
    const isShare = pathname.startsWith('/s/');

    const currentChat = useChat(chatManager, id, isShare);
    const [authenticated, setAuthenticated] = useState(backend?.isAuthenticated || false);
    const [wasAuthenticated, setWasAuthenticated] = useState(backend?.isAuthenticated || false);

    const narrativeAgent = new StreamingAgent(chatManager);



    useEffect(() => {
        chatManager.on('y-update', update => backend?.receiveYUpdate(update))
    }, []);

    const updateAuth = useCallback((authenticated: boolean) => {
        setAuthenticated(authenticated);
        if (authenticated && backend.user) {
            chatManager.login(backend.user.email || backend.user.id);
        }
        if (authenticated) {
            setWasAuthenticated(true);
            localStorage.setItem('registered', 'true');
        }
    }, []);

    useEffect(() => {
        updateAuth(backend?.isAuthenticated || false);
        backend?.on('authenticated', updateAuth);
        return () => {
            backend?.off('authenticated', updateAuth)
        };
    }, [updateAuth]);

    const onNewMessage = useCallback(async (message?: string) => {
        resetAudioContext();
        
        if (isShare) {
            return false;
        }
    
        const trimmedMessage = message?.trim();
        if (!trimmedMessage) {
            return false;
        }
    
        const openaiApiKey = chatManager.options.getOption<string>('openai', 'apiKey');
    
        if (!openaiApiKey && !isProxySupported()) {
            dispatch(openOpenAIApiKeyPanel());
            return false;
        }
    
        const parameters: Parameters = {
            model: chatManager.options.getOption<string>('parameters', 'model', id),
            temperature: chatManager.options.getOption<number>('parameters', 'temperature', id),
        };

        if (id === nextID) {
            setNextID(uuidv4());
    
            const autoPlay = chatManager.options.getOption<boolean>('tts', 'autoplay');
            if (autoPlay) {
                const ttsService = chatManager.options.getOption<string>('tts', 'service');
                if (ttsService === 'web-speech') {
                    const utterance = new SpeechSynthesisUtterance('Generating');
                    utterance.volume = 0;
                    speechSynthesis.speak(utterance);
                }
            }
        }

        // Use the agent to send the message and handle the reply
 
        await narrativeAgent.sendMessage(
            id,
            trimmedMessage,
            {
                ...parameters,
                apiKey: openaiApiKey,
            },
            currentChat.leaf?.id,
            true // will publish the message to chat
        );
    
        return id;
    }, [dispatch, id, currentChat.leaf, isShare]);

    const regenerateMessage = useCallback(async (message: Message) => {
        resetAudioContext();

        if (isShare) {
            return false;
        }

        // const openaiApiKey = store.getState().apiKeys.openAIApiKey;
        const openaiApiKey = chatManager.options.getOption<string>('openai', 'apiKey');

        if (!openaiApiKey && !isProxySupported()) {
            dispatch(openOpenAIApiKeyPanel());
            return false;
        }

        const parameters: Parameters = {
            model: chatManager.options.getOption<string>('parameters', 'model', id),
            temperature: chatManager.options.getOption<number>('parameters', 'temperature', id),
        };

        await chatManager.regenerate(message, {
            ...parameters,
            apiKey: openaiApiKey,
        });

        return true;
    }, [dispatch, isShare]);

    const editMessage = useCallback(async (message: Message, content: string) => {
        resetAudioContext();
        
        if (isShare) {
            return false;
        }

        if (!content?.trim().length) {
            return false;
        }

        // const openaiApiKey = store.getState().apiKeys.openAIApiKey;
        const openaiApiKey = chatManager.options.getOption<string>('openai', 'apiKey');

        if (!openaiApiKey && !isProxySupported()) {
            dispatch(openOpenAIApiKeyPanel());
            return false;
        }

        const parameters: Parameters = {
            model: chatManager.options.getOption<string>('parameters', 'model', id),
            temperature: chatManager.options.getOption<number>('parameters', 'temperature', id),
        };

        if (id && chatManager.has(id)) {
            await chatManager.sendMessage({
                chatID: id,
                content: content.trim(),
                requestedParameters: {
                    ...parameters,
                    apiKey: openaiApiKey,
                },
                parentID: message.parentID,
            });
        } else {
            const id = await chatManager.createChat();
            await chatManager.sendMessage({
                chatID: id,
                content: content.trim(),
                requestedParameters: {
                    ...parameters,
                    apiKey: openaiApiKey,
                },
                parentID: message.parentID,
            });
        }

        return true;
    }, [dispatch, id, isShare]);

    const generating = currentChat?.messagesToDisplay?.length > 0
        ? !currentChat.messagesToDisplay[currentChat.messagesToDisplay.length - 1].done
        : false;

    const context = useMemo<Context>(() => ({
        authenticated,
        sessionExpired: !authenticated && wasAuthenticated,
        id,
        user: backend.user,
        intl,
        chat: chatManager,
        currentChat,
        isHome,
        isShare,
        generating,
        onNewMessage,
        regenerateMessage,
        editMessage,
    }), [authenticated, wasAuthenticated, generating, onNewMessage, regenerateMessage, editMessage, currentChat, id, isHome, isShare, intl]);

    return context;
}

export function useAppContext() {
    return React.useContext(AppContext);
}

export function AppContextProvider(props: { children: React.ReactNode }) {
    const context = useCreateAppContext();
    return <AppContext.Provider value={context}>
        <TTSContextProvider>
            {props.children}
        </TTSContextProvider>
    </AppContext.Provider>;
}