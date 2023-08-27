import React, { useState, useRef, useMemo, useEffect, useCallback } from "react";
import { v4 as uuidv4 } from 'uuid';
import { IntlShape, useIntl } from "react-intl";
import { Backend, User } from "./backend";
import { ChatManager } from "./";
import { useAppDispatch } from "../store";
import { openOpenAIApiKeyPanel } from "../store/settings-ui";
import { Message, Parameters } from "./chat/types";
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

// AGENTS
abstract class Agent<T> {
    protected chatManager: ChatManager;

    constructor(chatManager: ChatManager) {
        this.chatManager = chatManager;
    }

    abstract preprocessMessage(message: string): string;
    abstract postprocessMessage(response: any): any;

    async sendMessage(message: string, chatID: string, parameters: T, shouldPublish: boolean = true): Promise<any> {
        const processedMessage = this.preprocessMessage(message);
        return processedMessage;
    }
}

class StreamingAgent extends Agent<any> { // Using 'any' here for maximum flexibility
    preprocessMessage(message: string): string {
        return message;
    }

    postprocessMessage(response: any): any {
        return response;
    }

    async sendMessage(message: string, chatID: string, parameters: any, shouldPublish: boolean = true): Promise<any> {
        const processedMessage = this.preprocessMessage(message);
    
        this.chatManager.sendMessage({
            chatID: chatID,
            content: processedMessage,
            requestedParameters: parameters,
        }, shouldPublish); // Pass the shouldPublish parameter here
    
        return processedMessage;
    }
}



/* class FullReplyAgent extends Agent<any> { // Using 'any' for maximum flexibility
    preprocessMessage(message: string): string {
        return message;
    }

    postprocessMessage(response: any): any {
        // Logic for postprocessing the response for FullReplyAgent
        // This can involve logging, analytics, or other operations that don't involve the user
        return;
    }

    async sendMessage(message: string, chatID: string, parameters: any): Promise<any> {
        const processedMessage = this.preprocessMessage(message);

        // Use the chatManager's sendMessage method directly
        this.chatManager.sendMessage({
            chatID: chatID,
            content: processedMessage,
            ...parameters // Spread the parameters directly
        });

        // Assuming you have a method or logic to wait for the entire reply to complete
        const fullReply = await // logic to get the full reply; NEED TO ENGINEER

        // Postprocess the full reply
        this.postprocessMessage(fullReply);

        return processedMessage;
    }
} */




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
            trimmedMessage,
            id,
            {
                ...parameters,
                apiKey: openaiApiKey,
                parentID: currentChat.leaf?.id
            }, true // will publish the message to chat
        );
    
        return id;
    }, [dispatch, id, currentChat.leaf, isShare]);

/* 
    const onNewMessage = useCallback(async (message?: string) => {
        resetAudioContext();
        
        if (isShare) {
            return false;
        }

        if (!message?.trim().length) {
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

        // if (chatManager.has(id)) {
            // chatManager.sendMessage({
            //     chatID: id,
            //     content: message.trim(),
            //     requestedParameters: {
            //         ...parameters,
            //         apiKey: openaiApiKey,
            //     },
            //     parentID: currentChat.leaf?.id,
            // });
        // } else {
        //     await chatManager.createChat(id);

            chatManager.sendMessage({
                chatID: id,
                content: message.trim(),
                requestedParameters: {
                    ...parameters,
                    apiKey: openaiApiKey,
                },
                parentID: currentChat.leaf?.id,
            });
        // }

        return id;
    }, [dispatch, id, currentChat.leaf, isShare]);
 */

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