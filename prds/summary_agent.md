## Goal
Reduce context size by implementing a summary agent that provides summaries to supplement messages.

## Overall Vision
1. Modify code to send only the last 10 messages to the AI. 
2. Messages 11 forward will include an abstract summary and extractive summary to supplement and help AI remain stateful.
3. Implement summary agent below.

### Prompt for Summary Agent
```
**Objective:** Generate a concise and informative summary of a conversation where a user interacts with an AI to edit a document. The summary should consist of two distinct parts: an Abstractive Summary and an Extractive Summary.

**Conversation Context:** The provided input will be a list of messages exchanged between a user and an AI. These messages will contain user instructions for document edits AND substantive discussion about the document's content.

**Key Instructions for Summarization:**

1.  **Prioritize Content Over Actions:** Your primary focus should be on summarizing the *content* being discussed, created, or modified within the document. Do **not** summarize the user's explicit editing commands or guidance to the AI (e.g., "change this sentence," "make this bold," "can you rephrase that?"). However, do consider the *subject matter* of those edits as part of the content.

2.  **Abstractive Summary:**
    * Provide a high-level, concise overview of the main topics discussed and the overall purpose or outcome of the conversation related to the document's content.
    * This summary should synthesize the information into new sentences.
    * **Length:** Strictly limit to **1-3 sentences**.

3.  **Extractive Summary:**
    * Identify and extract key points, arguments, decisions, and significant pieces of information directly from the conversation.
    * **Focus on:**
        * Topics the user explicitly states are important (e.g., "This is a key takeaway," "Make sure to include this").
        * Themes, keywords, or topics the user emphasizes, perhaps through repetition or by asking multiple clarifying questions about them.
        * Significant information or facts discussed.
    * Organize these points hierarchically if sub-points exist.

**Output Format:**

Your response **must** strictly adhere to the following format:

# Abstract Summary:
---
[Your abstract summary here, 1-3 sentences]

# Extractive Summary:
---
* Main point 1
    * Sub-point 1.1 (if applicable)
    * Sub-point 1.2 (if applicable)
* Main point 2
* Main point 3
    * Sub-point 3.1 (if applicable)

**Input:**

[Placeholder for the list of messages in the conversation]
```
### Requirements
- This will run on the submission of every 10th message of document, eg (number of messages in a conversations reaches 10, 20, 30, etc). This means that documents with fewer than 10 messages will not have any kind of summary.
- All messages will be passed to this agent every 10th message.
- Results to be persisted on documents table. Need to create at least 2 columns: abstract_summary, extractive_summary
- `abstract_summary` and `extractive_summary` need to be added to the AI's prompt similar to how tagged documents are added as context
- For illustration, the messages that are fed to the summary agent should look like (only for illustration):
    ```sql
    select role, content, coalesce(content[0]->>'text',content[1]->>'text') content_text
    from messages 
    where document_id = 'afd5e6cf-7c7b-4923-bdf6-640b862956e3'
    order by created_at asc
    ```
    Output:
    |role|content_text|
    |---|---|
    |user|I'm going to start a feature list for my app, just start a new document and then I'll add to it.|
    |user|I'm going to start a feature list for my app, just start a new document and then I'll add to it.|
    |assistant|Okay, I can help with that. I'll add a heading for your feature list to get you started. What should the main heading be? Or would "Feature List" work?|
    |user|Okay, for each of the blank categories, go ahead and add justification for why I'm adding it.|
    |assistant|Okay, I can add some justification for the blank bullet points based on their headings
- Model to use: `gemini-1.5-flash-8b`
- See `app\api\generate-title\route.ts` on how a generate title agent is used, perhaps we can recycle some functionality

### Implementation Details (API Route)
- Create a new API route file, e.g., `app/api/generate-summary/route.ts`.
- Implement a POST request handler in this file.
- This handler will receive the list of messages from the conversation in the request body.
- Use the `@ai-sdk/google` library and `generateText` function, similar to `generate-title/route.ts`.
- Instantiate the model with `gemini-1.5-flash-8b`.
- Use the "Prompt for Summary Agent" defined above as the system prompt.
- Format the input messages into a suitable string format for the AI model in the user prompt, potentially similar to the illustrated SQL output.
- Parse the model's output to extract the abstract and extractive summaries based on the specified output format.
- Return the extracted summaries in a JSON response.

### Implementation Details (Application Flow)
- Modify the application logic (where messages are processed and sent to the AI) to:
    - Trigger the summary agent API call every 10th message.
    - Send the full list of messages up to that point to the `generate-summary` API route.
    - Upon receiving the summaries, persist them to the new `abstract_summary` and `extractive_summary` columns in the `documents` table.
    - When sending subsequent messages (from the 11th message onwards) to the main AI model, include the latest abstract and extractive summaries in the prompt context, similar to how tagged documents are included.

### Detailed Step-by-Step Implementation Guide

1.  **Database Schema Update:**
    *   Add two new columns, `abstract_summary` (text/string type) and `extractive_summary` (text/string type), to the `documents` table.
    *   Create a database migration script for this change.

2.  **Create Summary Agent API Route:**
    *   Create a new file `app/api/generate-summary/route.ts`.
    *   Implement a `POST` asynchronous function in this file to handle incoming requests.
    *   Inside the `POST` function:
        *   Parse the request body to get the list of messages.
        *   Instantiate the `gemini-1.5-flash-8b` model using `@ai-sdk/google`.
        *   Format the list of messages into a string suitable for the AI model prompt, potentially mimicking the illustrated SQL output format from the requirements.
        *   Use the "Prompt for Summary Agent" from this document as the system prompt for the AI model.
        *   Call the `generateText` function from `ai` with the model, system prompt, and formatted messages.
        *   Parse the `generatedText` response to extract the content under the "# Abstract Summary:" and "# Extractive Summary:" headings, adhering to the specified output format.
        *   Return the extracted `abstract_summary` and `extractive_summary` in a JSON response.
        *   Include appropriate error handling and logging.

3.  **Integrate Summary Agent in Chat API:**
    *   Locate the `app/api/chat/route.ts` file.
    *   Inside the main `POST` request handler:
        *   After a new user message is successfully saved to the database:
            *   Fetch the total number of messages for the current `documentId`.
            *   Check if the total number of messages is a multiple of 10 (e.g., `totalMessages % 10 === 0`).
            *   If it is the 10th, 20th, 30th, etc., message:
                *   Fetch the complete list of messages for the `documentId` from the database.
                *   Make an internal API call (e.g., using `fetch` or a dedicated internal helper function) to the new `/api/generate-summary` route, sending the list of messages.
                *   Upon receiving the JSON response from `/api/generate-summary` containing the `abstract_summary` and `extractive_summary`:
                    *   Update the corresponding `documentId` entry in the `documents` table with these new summary values.
                    *   Include error handling for the API call and database update.
        *   Before sending messages to the *main* AI model via `streamText`:
            *   Fetch the latest `abstract_summary` and `extractive_summary` from the `documents` table for the current `documentId`.
            *   If summaries exist (i.e., after the 10th message), include them in the messages array sent to the AI model. This should be added as context, similar to how tagged documents are currently added, potentially as a special user or system message preceding the conversation history.

4.  **Frontend Considerations (Minimal):**
    *   Ensure that when fetching initial document data or messages, the presence of the new summary fields on the `documents` table does not cause errors, even if they are not directly displayed in the chat UI.