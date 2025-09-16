import { z } from 'zod';

export const summarizeSchema = z.object({
  text: z.string(),
});

export const summarize = async (text: string) => {
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
        Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
        },
        body: JSON.stringify({
        model: 'openrouter/sonoma-dusk-alpha',
        messages: [
            {
                role: 'system',
                content: 'You are a helpful assistant that summarizes text.',
            },
            {
                role: 'user',
                content: `Summarize the following text, return only the summary: <text>${text}</text>`,
            },
        ],
        }),
    });

    const data = await response.json() as any;
    console.log(data);
    return data.choices[0].message.content as string;
};