/**
 * @fileOverview Client-side parameter extraction from natural language.
 * Replaces the Genkit server-side flow with a simple regex-based parser.
 */

export interface AdjustPipelineParametersInput {
  naturalLanguagePrompt: string;
  currentYear: number;
  currentMonth: number;
}

export interface AdjustPipelineParametersOutput {
  year: number;
  month: number;
  reasoning: string;
}

const MONTH_MAP: Record<string, number> = {
  janeiro: 1, fevereiro: 2, março: 3, marco: 3, abril: 4,
  maio: 5, junho: 6, julho: 7, agosto: 8,
  setembro: 9, outubro: 10, novembro: 11, dezembro: 12,
  jan: 1, fev: 2, mar: 3, abr: 4, mai: 5, jun: 6,
  jul: 7, ago: 8, set: 9, out: 10, nov: 11, dez: 12,
  january: 1, february: 2, march: 3, april: 4, may: 5, june: 6,
  july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
};

export async function adjustPipelineParameters(
  input: AdjustPipelineParametersInput
): Promise<AdjustPipelineParametersOutput> {
  const prompt = input.naturalLanguagePrompt.toLowerCase();
  let year = input.currentYear;
  let month = input.currentMonth;
  const reasons: string[] = [];

  // Extract year (4-digit number between 2000-2099)
  const yearMatch = prompt.match(/\b(20\d{2})\b/);
  if (yearMatch) {
    year = parseInt(yearMatch[1]);
    reasons.push(`Ano extraído: ${year}`);
  } else {
    reasons.push(`Ano não especificado, usando padrão: ${year}`);
  }

  // Extract month by name
  let monthFound = false;
  for (const [name, num] of Object.entries(MONTH_MAP)) {
    if (prompt.includes(name)) {
      month = num;
      reasons.push(`Mês extraído: ${name} (${num})`);
      monthFound = true;
      break;
    }
  }

  // Extract month by number pattern (e.g., "mês 3", "mes 03", "month 12")
  if (!monthFound) {
    const monthNumMatch = prompt.match(/m[eê]s\s*(\d{1,2})/i) || prompt.match(/(\d{1,2})\/\d{2,4}/);
    if (monthNumMatch) {
      const m = parseInt(monthNumMatch[1]);
      if (m >= 1 && m <= 12) {
        month = m;
        reasons.push(`Mês extraído do número: ${m}`);
        monthFound = true;
      }
    }
  }

  if (!monthFound) {
    reasons.push(`Mês não especificado, usando padrão: ${month}`);
  }

  return {
    year,
    month,
    reasoning: reasons.join('. ') + '.',
  };
}
