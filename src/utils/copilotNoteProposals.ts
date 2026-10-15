export interface PlayerNoteProposal {
  id: string;
  playerName: string;
  proposedNote: string;
  reason?: string;
  mode?: 'append' | 'replace';
}

/**
 * Pulisce una stringa JSON prima del parse (rimuove trailing commas, newline malformati)
 */
function cleanJsonString(raw: string): string {
  let s = raw.trim();
  // Rimuovi eventuali backtick markdown rimasti
  s = s.replace(/^```(json)?/i, '').replace(/```$/, '').trim();
  // Rimuovi trailing commas prima di } o ]
  s = s.replace(/,(\s*[}\]])/g, '$1');
  return s;
}

/**
 * Estrae le proposte di aggiornamento nota calciatore dal testo generato da Gemini
 * e restituisce il testo ripulito dal tag tecnico e l'elenco delle proposte strutturate.
 */
export function extractPlayerNoteProposals(content: string): {
  cleanContent: string;
  proposals: PlayerNoteProposal[];
} {
  if (!content || !content.includes(':::propose_player_note')) {
    return { cleanContent: content, proposals: [] };
  }

  const proposals: PlayerNoteProposal[] = [];
  const regex = /:::propose_player_note\s*(?:```(?:json)?\s*)?(\{[\s\S]*?\})(?:\s*```)?\s*:::/gi;

  let match: RegExpExecArray | null;
  let counter = 0;

  // Clona la regex per estrarre tutti i blocchi
  while ((match = regex.exec(content)) !== null) {
    const rawJson = match[1];
    try {
      const parsed = JSON.parse(cleanJsonString(rawJson));
      if (parsed && typeof parsed.playerName === 'string' && typeof parsed.proposedNote === 'string') {
        const pName = parsed.playerName.trim();
        const pNote = parsed.proposedNote.trim();
        if (pName && pNote) {
          counter++;
          proposals.push({
            id: `prop_${Date.now()}_${counter}_${pName.replace(/\s+/g, '_')}`,
            playerName: pName,
            proposedNote: pNote,
            reason: parsed.reason?.trim() || undefined,
            mode: parsed.mode === 'replace' ? 'replace' : 'append',
          });
        }
      }
    } catch {
      // Fallback: parsing euristico se il JSON presentava caratteri non escapati
      try {
        const nameMatch = rawJson.match(/"playerName"\s*:\s*"([^"]+)"/);
        const noteMatch = rawJson.match(/"proposedNote"\s*:\s*"([\s\S]+?)"\s*,\s*"(?:reason|mode)"/);
        const reasonMatch = rawJson.match(/"reason"\s*:\s*"([^"]+)"/);
        const modeMatch = rawJson.match(/"mode"\s*:\s*"(append|replace)"/);

        if (nameMatch && nameMatch[1]) {
          const pName = nameMatch[1].trim();
          const pNote = noteMatch ? noteMatch[1].replace(/\\n/g, '\n').replace(/\\"/g, '"').trim() : '';
          if (pName && pNote) {
            counter++;
            proposals.push({
              id: `prop_${Date.now()}_${counter}_${pName.replace(/\s+/g, '_')}`,
              playerName: pName,
              proposedNote: pNote,
              reason: reasonMatch ? reasonMatch[1].trim() : undefined,
              mode: modeMatch && modeMatch[1] === 'replace' ? 'replace' : 'append',
            });
          }
        }
      } catch {
        // Silently skip if unparseable
      }
    }
  }

  // Rimuovi i tag :::propose_player_note...::: dal testo visibile
  const cleanContent = content
    .replace(/:::propose_player_note\s*(?:```(?:json)?\s*)?(\{[\s\S]*?\})(?:\s*```)?\s*:::/gi, '')
    .trim();

  return { cleanContent, proposals };
}

/**
 * Combina la nota esistente del giocatore con la nuova nota proposta secondo la modalità scelta,
 * assicurando la presenza del tag [Copilot AI] per identificare le note nate dal confronto con il Copilot.
 */
export const COPILOT_NOTE_TAG = '[Copilot AI]';

/**
 * Verifica se un testo o frammento di nota contiene un tag Copilot o AI
 */
export function isCopilotNote(text?: string): boolean {
  if (!text || typeof text !== 'string') return false;
  // Riconosce tag come [Copilot AI], [Copilot AI • Data], [AI Copilot], [Copilot], [AI], [Co-Allenatore]
  return /\[(?:Copilot(?:\s+AI)?|AI(?:\s+Copilot)?|AI|Co-Allenatore)(?:[\s•\-_:][^\]]*)?\]/i.test(text);
}

/**
 * Formatta il testo della nota applicando il tag identificativo [Copilot AI] o [Copilot AI • Data]
 * se non già presente.
 */
export function formatCopilotNote(
  newNoteText: string,
  dateStr?: string,
  tagLabel: string = 'Copilot AI'
): string {
  const trimmed = newNoteText.trim();
  if (!trimmed) return '';

  // Se ha già un tag Copilot/AI all'inizio, non duplicarlo
  if (/^\[(?:Copilot(?:\s+AI)?|AI(?:\s+Copilot)?|AI|Co-Allenatore)/i.test(trimmed)) {
    return trimmed;
  }

  const cleanDate = dateStr?.trim();
  const tagHeader = cleanDate ? `[${tagLabel} • ${cleanDate}]` : `[${tagLabel}]`;

  return `${tagHeader}: ${trimmed}`;
}

export interface NoteSegment {
  isCopilot: boolean;
  headerTag?: string;
  body: string;
}

/**
 * Suddivide una nota calciatore (che può contenere più paragrafi, alcuni scritti dal Manager e altri dal Copilot)
 * in segmenti distinti per facilitarne la visualizzazione con badge dedicati.
 */
export function extractCopilotNoteSegments(notes?: string): NoteSegment[] {
  if (!notes || !notes.trim()) return [];

  const trimmed = notes.trim();
  // Suddivide per doppi a-capo o per inizio di blocco con parentesi quadre
  const blocks = trimmed.split(/\n\s*\n/).filter(b => b.trim().length > 0);

  if (blocks.length === 0) {
    return [{ isCopilot: isCopilotNote(trimmed), body: trimmed }];
  }

  return blocks.map(block => {
    const blockTrimmed = block.trim();
    const tagMatch = blockTrimmed.match(/^(\[(?:Copilot(?:\s+AI)?|AI(?:\s+Copilot)?|AI|Co-Allenatore)(?:[\s•\-_:][^\]]*)?\])(?::?\s*)([\s\S]*)$/i);
    if (tagMatch) {
      return {
        isCopilot: true,
        headerTag: tagMatch[1],
        body: tagMatch[2]?.trim() || blockTrimmed,
      };
    }
    return {
      isCopilot: isCopilotNote(blockTrimmed),
      body: blockTrimmed,
    };
  });
}

/**
 * Combina la nota esistente del giocatore con la nuova nota proposta secondo la modalità scelta.
 * Per impostazione predefinita, applica il tag [Copilot AI] alle note generate o proposte dal Copilot.
 */
export function combinePlayerNote(
  existingNote: string | undefined,
  newNoteText: string,
  mode: 'append' | 'replace',
  dateStr?: string,
  applyCopilotTag: boolean = true
): string {
  const formattedNew = applyCopilotTag ? formatCopilotNote(newNoteText, dateStr) : newNoteText.trim();
  if (mode === 'replace') {
    return formattedNew;
  }

  const trimmedExisting = existingNote ? existingNote.trim() : '';
  if (!trimmedExisting) {
    return formattedNew;
  }

  return `${trimmedExisting}\n\n${formattedNew}`;
}
