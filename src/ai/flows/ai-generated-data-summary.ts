'use server';
/**
 * @fileOverview This file defines a Genkit flow for generating an AI-powered summary
 * of transformed data from the vFleet pilot program.
 *
 * - generateDataSummary - A function that takes transformed data and returns a summary.
 * - TransformedDataSummaryInput - The input type for the generateDataSummary function.
 * - TransformedDataSummaryOutput - The return type for the generateDataSummary function.
 */

import { ai } from '@/ai/genkit';
import { z } from 'genkit';

const TransformedDataSummaryInputSchema = z.object({
  consolidatedDriverData: z.string().describe(
    "A JSON string representing the consolidated driver performance data, " +
    "including 'Motorista', 'Dias com Atividade', 'Dias Bonificados (4/4)', " +
    "'Percentual de Desempenho (%)', 'Total Bonificação (R$)', and failure counts."
  ),
  pipelineContext: z.string().optional().describe(
    "Optional context about the pipeline run, such as month/year or specific parameters."
  ),
});
export type TransformedDataSummaryInput = z.infer<typeof TransformedDataSummaryInputSchema>;

const TransformedDataSummaryOutputSchema = z.object({
  summary: z.string().describe("An AI-generated summary of the transformed data, highlighting key insights and performance trends."),
});
export type TransformedDataSummaryOutput = z.infer<typeof TransformedDataSummaryOutputSchema>;

export async function generateDataSummary(input: TransformedDataSummaryInput): Promise<TransformedDataSummaryOutput> {
  return generateDataSummaryFlow(input);
}

const prompt = ai.definePrompt({
  name: 'generateDataSummaryPrompt',
  input: { schema: TransformedDataSummaryInputSchema },
  output: { schema: TransformedDataSummaryOutputSchema },
  prompt: `You are an expert data analyst specialized in summarizing performance reports for transportation and logistics operations.
Your task is to analyze the provided consolidated driver performance data from the vFleet pilot program and generate a concise summary.
Focus on identifying key insights, performance trends, and notable outcomes.

The data is provided in JSON format, representing the "05_Consolidado_Motorista" sheet, with columns like:
- "Motorista": The driver's name.
- "Dias com Atividade": Total days the driver had activity.
- "Dias Bonificados (4/4)": Days where the driver met all 4 conduction criteria.
- "Percentual de Desempenho (%)": Percentage of bonified days out of total active days.
- "Total Bonificação (R$)": Total bonus received by the driver.
- "Falhas Curva Brusca", "Falhas Banguela", "Falhas Ociosidade", "Falhas Exc. Velocidade": Counts of days each criterion was failed.

Context about the pipeline run: {{{pipelineContext}}}

Here is the consolidated driver performance data:
{{{consolidatedDriverData}}}

Based on this data, provide a summary that includes:
1.  Overall performance overview (e.g., average performance percentage, total bonification across all drivers).
2.  Top performing drivers (by 'Percentual de Desempenho (%)' and 'Total Bonificação (R$)').
3.  Drivers needing improvement.
4.  Common failure types (e.g., which failure categories are most frequent).
5.  Any other significant trends or observations.

Ensure the summary is clear, actionable, and easy to understand for stakeholders.
Your output MUST be a JSON object conforming to the TransformedDataSummaryOutputSchema.
`,
});

const generateDataSummaryFlow = ai.defineFlow(
  {
    name: 'generateDataSummaryFlow',
    inputSchema: TransformedDataSummaryInputSchema,
    outputSchema: TransformedDataSummaryOutputSchema,
  },
  async (input) => {
    const { output } = await prompt(input);
    if (!output) {
      throw new Error('Failed to generate summary from AI model.');
    }
    return output;
  }
);
