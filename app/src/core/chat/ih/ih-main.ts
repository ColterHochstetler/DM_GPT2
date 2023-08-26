import fs from 'fs';
import path from 'path';

function readDMRules(): string {
    const filePath = path.join(__dirname, 'data-dmrules.txt'); 
    return fs.readFileSync(filePath, 'utf-8');
}

function appendDMRulesToMessage(userMessage: string): string {
    const dmRules = readDMRules();
    return `${userMessage}\n\n${dmRules}`;
}

export function processMessage(userMessage: string): string {
    // Step 1: Append DM Rules to the message
    let processedMessage = appendDMRulesToMessage(userMessage);

    // Add more processing steps

    return processedMessage;
}