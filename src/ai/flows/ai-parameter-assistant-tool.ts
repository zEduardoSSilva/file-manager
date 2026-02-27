'use server';
/**
 * @fileOverview A Genkit flow for assisting users in adjusting pipeline parameters using natural language.
 *
 * - adjustPipelineParameters - A function that takes a natural language prompt and extracts pipeline parameters.
 * - AdjustPipelineParametersInput - The input type for the adjustPipelineParameters function.
 * - AdjustPipelineParametersOutput - The return type for the adjustPipelineParameters function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

// Input schema for the pipeline parameter adjustment
const AdjustPipelineParametersInputSchema = z.object({
  naturalLanguagePrompt: z
    .string()
    .describe('The natural language prompt from the user to adjust pipeline parameters.'),
  currentYear: z
    .number()
    .int()
    .min(2000) // Assuming a reasonable range for years
    .max(2100)
    .default(new Date().getFullYear()) // Default to current year if not provided by caller
    .describe('The current default year for the pipeline. Used as a fallback if not specified in the prompt.'),
  currentMonth: z
    .number()
    .int()
    .min(1)
    .max(12)
    .default(new Date().getMonth() + 1) // Default to current month if not provided by caller (getMonth is 0-indexed)
    .describe('The current default month for the pipeline. Used as a fallback if not specified in the prompt.'),
});
export type AdjustPipelineParametersInput = z.infer<typeof AdjustPipelineParametersInputSchema>;

// Output schema for the adjusted pipeline parameters
const AdjustPipelineParametersOutputSchema = z.object({
  year: z
    .number()
    .int()
    .min(2000)
    .max(2100)
    .describe('The extracted year for the pipeline parameters. Defaults to current year if not specified.'),
  month: z
    .number()
    .int()
    .min(1)
    .max(12)
    .describe('The extracted month for the pipeline parameters. Defaults to current month if not specified.'),
  reasoning: z
    .string()
    .describe('Explanation of how the parameters were extracted and any assumptions made.'),
});
export type AdjustPipelineParametersOutput = z.infer<typeof AdjustPipelineParametersOutputSchema>;

/**
 * Orchestrates the adjustment of pipeline parameters (year and month) based on a natural language prompt.
 * It utilizes a Genkit prompt to interpret the user's intent and provide the updated parameters.
 * @param input - The input object containing the natural language prompt and current default parameters.
 * @returns A Promise that resolves to the AdjustPipelineParametersOutput, containing the extracted year, month, and reasoning.
 */
export async function adjustPipelineParameters(
  input: AdjustPipelineParametersInput
): Promise<AdjustPipelineParametersOutput> {
  return aiParameterAssistantToolFlow(input);
}

// Define the Genkit prompt for parameter extraction
const aiParameterAssistantToolPrompt = ai.definePrompt({
  name: 'aiParameterAssistantToolPrompt',
  input: { schema: AdjustPipelineParametersInputSchema },
  output: { schema: AdjustPipelineParametersOutputSchema },
  prompt: `You are an AI assistant designed to extract pipeline parameters (specifically month and year) from natural language prompts.
If the user does not specify a year, use the 'currentYear' provided in the context.
If the user does not specify a month, use the 'currentMonth' provided in the context.

Be explicit about your reasoning, especially when using defaults or making assumptions.

Context:
  Current Default Year: {{{currentYear}}}
  Current Default Month: {{{currentMonth}}}

User Prompt: "{{{naturalLanguagePrompt}}}"

Extract the year and month. Respond in JSON format according to the output schema.`,
});

// Define the Genkit flow that wraps the prompt execution
const aiParameterAssistantToolFlow = ai.defineFlow(
  {
    name: 'aiParameterAssistantToolFlow',
    inputSchema: AdjustPipelineParametersInputSchema,
    outputSchema: AdjustPipelineParametersOutputSchema,
  },
  async (input) => {
    const { output } = await aiParameterAssistantToolPrompt(input);
    return output!;
  }
);
