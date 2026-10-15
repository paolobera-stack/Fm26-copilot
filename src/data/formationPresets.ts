import { TacticalPosition, TacticPreset } from '../types';

export interface FormationPreset {
  id: string;
  name: string; // e.g. "4-3-3"
  label: string; // e.g. "4-3-3 (Tre Punte / Ali)"
  defaultStyle: string;
  defaultMentality: 'Molto Offensiva' | 'Offensiva' | 'Positiva' | 'Equilibrata' | 'Prudente' | 'Difensiva';
  positions: TacticalPosition[];
}

export const FORMATION_PRESETS: FormationPreset[] = [
  {
    id: '4-3-3',
    name: '4-3-3',
    label: '4-3-3 (Tre Punte / Ali Larghe)',
    defaultStyle: 'Gegenpress',
    defaultMentality: 'Positiva',
    positions: [
      { id: 'pos1', label: 'POR', role: 'Portiere Libero', duty: 'Supporto', coords: { x: 50, y: 90 } },
      { id: 'pos2', label: 'TD', role: 'Terzino Invertito', duty: 'Supporto', coords: { x: 82, y: 72 } },
      { id: 'pos3', label: 'DC-D', role: 'Difensore che Imposta', duty: 'Difesa', coords: { x: 63, y: 76 } },
      { id: 'pos4', label: 'DC-I', role: 'Difensore Centrale', duty: 'Difesa', coords: { x: 37, y: 76 } },
      { id: 'pos5', label: 'TS', role: 'Fluidificante', duty: 'Attacco', coords: { x: 18, y: 72 } },
      { id: 'pos6', label: 'MED', role: 'Regista Arretrato', duty: 'Supporto', coords: { x: 50, y: 55 } },
      { id: 'pos7', label: 'MEZ-D', role: 'Mezzala', duty: 'Attacco', coords: { x: 68, y: 42 } },
      { id: 'pos8', label: 'CC-I', role: 'Centrocampista di Quantità', duty: 'Supporto', coords: { x: 32, y: 42 } },
      { id: 'pos9', label: 'AD', role: 'Ala Invertita', duty: 'Attacco', coords: { x: 80, y: 22 } },
      { id: 'pos10', label: 'AS', role: 'Attaccante Esterno', duty: 'Attacco', coords: { x: 20, y: 22 } },
      { id: 'pos11', label: 'PC', role: 'Pressing Forward', duty: 'Attacco', coords: { x: 50, y: 12 } }
    ]
  },
  {
    id: '4-2-3-1',
    name: '4-2-3-1',
    label: '4-2-3-1 (Doppio Mediano e Trequartista)',
    defaultStyle: 'Controllo del possesso',
    defaultMentality: 'Positiva',
    positions: [
      { id: 'pos1', label: 'POR', role: 'Portiere Libero', duty: 'Supporto', coords: { x: 50, y: 90 } },
      { id: 'pos2', label: 'TD', role: 'Terzino', duty: 'Supporto', coords: { x: 82, y: 72 } },
      { id: 'pos3', label: 'DC-D', role: 'Difensore Centrale', duty: 'Difesa', coords: { x: 63, y: 76 } },
      { id: 'pos4', label: 'DC-I', role: 'Difensore Centrale', duty: 'Difesa', coords: { x: 37, y: 76 } },
      { id: 'pos5', label: 'TS', role: 'Fluidificante', duty: 'Supporto', coords: { x: 18, y: 72 } },
      { id: 'pos6', label: 'MED-D', role: 'Incontrista', duty: 'Difesa', coords: { x: 62, y: 56 } },
      { id: 'pos7', label: 'MED-I', role: 'Regista Arretrato', duty: 'Supporto', coords: { x: 38, y: 56 } },
      { id: 'pos8', label: 'TRQ', role: 'Trequartista', duty: 'Attacco', coords: { x: 50, y: 34 } },
      { id: 'pos9', label: 'AD', role: 'Ala', duty: 'Attacco', coords: { x: 80, y: 26 } },
      { id: 'pos10', label: 'AS', role: 'Ala Invertita', duty: 'Attacco', coords: { x: 20, y: 26 } },
      { id: 'pos11', label: 'PC', role: 'Attaccante Avanzato', duty: 'Attacco', coords: { x: 50, y: 12 } }
    ]
  },
  {
    id: '3-5-2',
    name: '3-5-2',
    label: '3-5-2 (Difesa a Tre ed Esterni a Tutta Fascia)',
    defaultStyle: 'Contropiede fluido',
    defaultMentality: 'Equilibrata',
    positions: [
      { id: 'pos1', label: 'POR', role: 'Portiere', duty: 'Difesa', coords: { x: 50, y: 90 } },
      { id: 'pos2', label: 'DC-D', role: 'Braccetto Difensivo', duty: 'Supporto', coords: { x: 70, y: 76 } },
      { id: 'pos3', label: 'DC-C', role: 'Difensore Centrale', duty: 'Difesa', coords: { x: 50, y: 78 } },
      { id: 'pos4', label: 'DC-I', role: 'Braccetto Difensivo', duty: 'Supporto', coords: { x: 30, y: 76 } },
      { id: 'pos5', label: 'ED', role: 'Fluidificante a Tutta Fascia', duty: 'Attacco', coords: { x: 86, y: 52 } },
      { id: 'pos6', label: 'MED', role: 'Regista Basso', duty: 'Difesa', coords: { x: 50, y: 56 } },
      { id: 'pos7', label: 'CC-D', role: 'Mezzala', duty: 'Attacco', coords: { x: 65, y: 42 } },
      { id: 'pos8', label: 'CC-I', role: 'Centrocampista di Quantità', duty: 'Supporto', coords: { x: 35, y: 42 } },
      { id: 'pos9', label: 'ES', role: 'Fluidificante a Tutta Fascia', duty: 'Attacco', coords: { x: 14, y: 52 } },
      { id: 'pos10', label: 'PC-D', role: 'Punta Avanzata', duty: 'Attacco', coords: { x: 60, y: 16 } },
      { id: 'pos11', label: 'PC-S', role: 'Attaccante di Raccordo', duty: 'Supporto', coords: { x: 40, y: 16 } }
    ]
  },
  {
    id: '4-4-2',
    name: '4-4-2',
    label: '4-4-2 (Classico con Ali e Due Punte)',
    defaultStyle: 'Gioco sulle fasce',
    defaultMentality: 'Equilibrata',
    positions: [
      { id: 'pos1', label: 'POR', role: 'Portiere', duty: 'Difesa', coords: { x: 50, y: 90 } },
      { id: 'pos2', label: 'TD', role: 'Terzino', duty: 'Supporto', coords: { x: 82, y: 72 } },
      { id: 'pos3', label: 'DC-D', role: 'Difensore Centrale', duty: 'Difesa', coords: { x: 63, y: 76 } },
      { id: 'pos4', label: 'DC-I', role: 'Difensore Centrale', duty: 'Difesa', coords: { x: 37, y: 76 } },
      { id: 'pos5', label: 'TS', role: 'Terzino', duty: 'Supporto', coords: { x: 18, y: 72 } },
      { id: 'pos6', label: 'CD', role: 'Centrocampista Laterale', duty: 'Attacco', coords: { x: 84, y: 46 } },
      { id: 'pos7', label: 'CC-D', role: 'Incontrista', duty: 'Difesa', coords: { x: 62, y: 48 } },
      { id: 'pos8', label: 'CC-I', role: 'Regista Mobile', duty: 'Supporto', coords: { x: 38, y: 48 } },
      { id: 'pos9', label: 'CS', role: 'Centrocampista Laterale', duty: 'Attacco', coords: { x: 16, y: 46 } },
      { id: 'pos10', label: 'PC-D', role: 'Uomo d\'Area', duty: 'Attacco', coords: { x: 60, y: 16 } },
      { id: 'pos11', label: 'PC-S', role: 'Attaccante di Sostegno', duty: 'Supporto', coords: { x: 40, y: 16 } }
    ]
  },
  {
    id: '5-3-2',
    name: '5-3-2',
    label: '5-3-2 (Catenaccio & Quinti Difensivi)',
    defaultStyle: 'Catenaccio',
    defaultMentality: 'Prudente',
    positions: [
      { id: 'pos1', label: 'POR', role: 'Portiere', duty: 'Difesa', coords: { x: 50, y: 90 } },
      { id: 'pos2', label: 'WBR', role: 'Terzino Fluidificante', duty: 'Supporto', coords: { x: 86, y: 68 } },
      { id: 'pos3', label: 'DC-D', role: 'Difensore Centrale', duty: 'Difesa', coords: { x: 68, y: 77 } },
      { id: 'pos4', label: 'DC-C', role: 'Libero / Copertura', duty: 'Difesa', coords: { x: 50, y: 79 } },
      { id: 'pos5', label: 'DC-I', role: 'Difensore Centrale', duty: 'Difesa', coords: { x: 32, y: 77 } },
      { id: 'pos6', label: 'WBL', role: 'Terzino Fluidificante', duty: 'Supporto', coords: { x: 14, y: 68 } },
      { id: 'pos7', label: 'MED', role: 'Incontrista', duty: 'Difesa', coords: { x: 50, y: 56 } },
      { id: 'pos8', label: 'CC-D', role: 'Centrocampista di Quantità', duty: 'Supporto', coords: { x: 65, y: 44 } },
      { id: 'pos9', label: 'CC-I', role: 'Regista Arretrato', duty: 'Supporto', coords: { x: 35, y: 44 } },
      { id: 'pos10', label: 'PC-D', role: 'Punta Avanzata', duty: 'Attacco', coords: { x: 60, y: 16 } },
      { id: 'pos11', label: 'PC-S', role: 'Seconda Punta', duty: 'Attacco', coords: { x: 40, y: 16 } }
    ]
  },
  {
    id: '3-4-2-1',
    name: '3-4-2-1',
    label: '3-4-2-1 (Due Trequartisti e Punta Isolata)',
    defaultStyle: 'Tiki-taka verticale',
    defaultMentality: 'Positiva',
    positions: [
      { id: 'pos1', label: 'POR', role: 'Portiere Libero', duty: 'Supporto', coords: { x: 50, y: 90 } },
      { id: 'pos2', label: 'DC-D', role: 'Braccetto Difensivo', duty: 'Supporto', coords: { x: 70, y: 76 } },
      { id: 'pos3', label: 'DC-C', role: 'Difensore Centrale', duty: 'Difesa', coords: { x: 50, y: 78 } },
      { id: 'pos4', label: 'DC-I', role: 'Braccetto Difensivo', duty: 'Supporto', coords: { x: 30, y: 76 } },
      { id: 'pos5', label: 'ED', role: 'Fluidificante a Tutta Fascia', duty: 'Supporto', coords: { x: 86, y: 50 } },
      { id: 'pos6', label: 'CC-D', role: 'Centrocampista Centrale', duty: 'Difesa', coords: { x: 62, y: 54 } },
      { id: 'pos7', label: 'CC-I', role: 'Regista Arretrato', duty: 'Supporto', coords: { x: 38, y: 54 } },
      { id: 'pos8', label: 'ES', role: 'Fluidificante a Tutta Fascia', duty: 'Supporto', coords: { x: 14, y: 50 } },
      { id: 'pos9', label: 'TRQ-D', role: 'Trequartista Libero', duty: 'Attacco', coords: { x: 65, y: 30 } },
      { id: 'pos10', label: 'TRQ-I', role: 'Regista Avanzato', duty: 'Supporto', coords: { x: 35, y: 30 } },
      { id: 'pos11', label: 'PC', role: 'Centravanti Completo', duty: 'Attacco', coords: { x: 50, y: 14 } }
    ]
  },
  {
    id: '4-1-2-1-2',
    name: '4-1-2-1-2',
    label: '4-1-2-1-2 (Rombo Stretto / Trequartista Centrale)',
    defaultStyle: 'Controllo del possesso',
    defaultMentality: 'Positiva',
    positions: [
      { id: 'pos1', label: 'POR', role: 'Portiere Libero', duty: 'Supporto', coords: { x: 50, y: 90 } },
      { id: 'pos2', label: 'TD', role: 'Fluidificante', duty: 'Attacco', coords: { x: 82, y: 72 } },
      { id: 'pos3', label: 'DC-D', role: 'Difensore Centrale', duty: 'Difesa', coords: { x: 63, y: 76 } },
      { id: 'pos4', label: 'DC-I', role: 'Difensore Centrale', duty: 'Difesa', coords: { x: 37, y: 76 } },
      { id: 'pos5', label: 'TS', role: 'Fluidificante', duty: 'Attacco', coords: { x: 18, y: 72 } },
      { id: 'pos6', label: 'MED', role: 'Mediano Metodista', duty: 'Difesa', coords: { x: 50, y: 60 } },
      { id: 'pos7', label: 'CC-D', role: 'Mezzala', duty: 'Supporto', coords: { x: 66, y: 46 } },
      { id: 'pos8', label: 'CC-I', role: 'Centrocampista di Quantità', duty: 'Supporto', coords: { x: 34, y: 46 } },
      { id: 'pos9', label: 'TRQ', role: 'Trequartista Puro', duty: 'Attacco', coords: { x: 50, y: 32 } },
      { id: 'pos10', label: 'PC-D', role: 'Punta Avanzata', duty: 'Attacco', coords: { x: 60, y: 16 } },
      { id: 'pos11', label: 'PC-S', role: 'Attaccante di Sostegno', duty: 'Supporto', coords: { x: 40, y: 16 } }
    ]
  }
];

export function createTacticFromFormationPreset(
  formationId: string,
  customName?: string,
  slotNumber: number = 1
): TacticPreset {
  const preset = FORMATION_PRESETS.find(f => f.id === formationId) || FORMATION_PRESETS[0];
  const newId = `t_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const slotLabel = slotNumber === 1 ? 'Primaria' : slotNumber === 2 ? 'Secondaria' : 'Terziaria';
  const name = customName || `${preset.name} ${slotLabel}`;

  const clonedPositions: TacticalPosition[] = preset.positions.map(p => ({
    ...p,
    id: `pos_${p.label.toLowerCase()}_${Math.random().toString(36).substring(2, 6)}`
  }));

  return {
    id: newId,
    name,
    formation: preset.name,
    mentality: preset.defaultMentality,
    tacticalStyle: preset.defaultStyle as any,
    tempo: 'Standard',
    passingStyle: 'Corto',
    defensiveLine: 'Alta',
    pressingTrigger: 'Molto Spesso',
    width: 'Standard',
    inPossessionInstructions: {
      tempo: 'Standard',
      passingStyle: 'Corto',
      width: 'Standard',
      playOutOfBack: true,
      workBallIntoBox: true,
      focusChannels: 'Misto'
    },
    outOfPossessionInstructions: {
      defensiveLine: 'Alta',
      lineOfEngagement: 'Alta',
      pressingTrigger: 'Molto Spesso',
      pressingTrap: 'Verso l\'Esterno',
      useOffsideTrap: true,
      tackling: 'Standard'
    },
    inTransitionInstructions: {
      whenLost: 'Contropressing',
      whenWon: 'Contropiede',
      goalkeeperDistribution: 'Rinvio Rapido'
    },
    positions: clonedPositions,
    inPossessionPositions: clonedPositions.map(p => ({ ...p })),
    outOfPossessionPositions: clonedPositions.map(p => ({ ...p })),
    combinedPositions: clonedPositions.map(p => ({ ...p }))
  };
}

export function duplicateTactic(
  sourceTactic: TacticPreset,
  targetSlotNumber: number,
  newName?: string
): TacticPreset {
  const newId = `t_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const slotSuffix = targetSlotNumber === 2 ? 'Secondaria' : targetSlotNumber === 3 ? 'Terziaria' : 'Copia';
  const name = newName || `${sourceTactic.name} (${slotSuffix})`;

  return {
    ...JSON.parse(JSON.stringify(sourceTactic)),
    id: newId,
    name
  };
}
