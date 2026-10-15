import React, { useState } from 'react';
import { MessageSquareCode, Award, ThumbsUp, ThumbsDown, ShieldAlert, Sparkles, CheckCircle } from 'lucide-react';

interface Question {
  id: string;
  mediaOutlet: string;
  journalist: string;
  topic: string;
  questionText: string;
  answers: {
    text: string;
    tone: 'Passionale' | 'Calmo' | 'Prudente' | 'Aggressivo' | 'Ironico';
    squadImpact: string;
    mediaImpact: string;
    isOptimal?: boolean;
  }[];
}

const pressScenarios: Question[] = [
  {
    id: 'q1',
    mediaOutlet: 'BBC Radio Northampton',
    journalist: 'David Smith',
    topic: 'Turnover & Champions League',
    questionText: "Mister, martedì c'è il Real Madrid in Champions League, ma oggi affrontate l'Arsenal. Avete intenzione di fare un turnover massiccio lasciando a riposo stelle come Gnonto ed Ferguson?",
    answers: [
      {
        text: "La nostra priorità è ogni singola gara. Metterò in campo la formazione migliore possibile oggi senza fare calcoli speculativi.",
        tone: "Passionale",
        squadImpact: "+1 Morale Titolari, i giocatori adorano la mentalità vincente.",
        mediaImpact: "La stampa elogia l'ambizione del Northampton.",
        isOptimal: true
      },
      {
        text: "Sì, ruoteremo sicuramente. La Champions richiede energie che in Premier non possiamo permetterci di sprecare.",
        tone: "Prudente",
        squadImpact: "-1 Cautela da parte dei tifosi, riserva felice per il minutaggio.",
        mediaImpact: "Critica dai media di Londra per sottovalutazione dell'incontro."
      },
      {
        text: "Non sono affari vostri. Deciderò la formazione 1 ora prima della partita.",
        tone: "Aggressivo",
        squadImpact: "Nessun impatto diretto, lieve tensione nello spogliatoio.",
        mediaImpact: "I media dipingono il manager come nervoso."
      }
    ]
  },
  {
    id: 'q2',
    mediaOutlet: 'Sky Sports Premier League',
    journalist: 'Geoff Shreeves',
    topic: 'Difesa del Titolo di Campioni',
    questionText: "L'anno scorso la vittoria della Premier col Northampton è stata paragonata all'impresa del Leicester. Sentite la pressione di dover dimostrare che non è stato solo un miracolo irripetibile?",
    answers: [
      {
        text: "Abbiamo meritato ogni singolo punto la scorsa stagione. Non dobbiamo dimostrare niente a nessuno tranne che a noi stessi.",
        tone: "Calmo",
        squadImpact: "+2 Coesione di squadra, spogliatoio unito.",
        mediaImpact: "Il mister dimostra una leadership di ferro.",
        isOptimal: true
      },
      {
        text: "I pronostici ci danno al 5° posto, va bene così. Continuiamo a lavorare fari spenti.",
        tone: "Prudente",
        squadImpact: "Stabile, bassa pressione.",
        mediaImpact: "Nessun titolo roboante nei giornali."
      }
    ]
  },
  {
    id: 'q3',
    mediaOutlet: 'Gazzetta dello Sport',
    journalist: 'Marco Pasotto',
    topic: 'Sandro Tonali & Wilfried Gnonto',
    questionText: "I due italiani Tonali e Gnonto stanno trascinando il Northampton anche in Europa. Che impatto hanno nello spogliatoio?",
    answers: [
      {
        text: "Sono due campioni straordinari con una professionalità esemplare. Stanno alzando il livello dell'intera squadra.",
        tone: "Passionale",
        squadImpact: "+2 Morale per Gnonto & Tonali, rispetto nello spogliatoio.",
        mediaImpact: "Grandi elogi dalla stampa internazionale.",
        isOptimal: true
      },
      {
        text: "Sono ottimi elementi, ma la squadra viene prima dei singoli.",
        tone: "Calmo",
        squadImpact: "Nessun cambiamento di morale.",
        mediaImpact: "Risposta standard senza infamia né lode."
      }
    ]
  }
];

export const PressConferenceCoach: React.FC = () => {
  const [selectedAnswers, setSelectedAnswers] = useState<Record<string, number>>({});

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl flex items-center justify-between">
        <div>
          <div className="flex items-center space-x-2">
            <MessageSquareCode className="w-5 h-5 text-indigo-400" />
            <h2 className="text-base font-bold text-white">Media & Press Conference Coach (FM26)</h2>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Metti alla prova le tue risposte alle interviste e conferenze stampa. In FM26 la gestione dei media influenza la fiducia della dirigenza e il morale dei giocatori.
          </p>
        </div>
      </div>

      {/* Questions list */}
      <div className="space-y-6">
        {pressScenarios.map((q) => {
          const chosenIndex = selectedAnswers[q.id];

          return (
            <div
              key={q.id}
              className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4"
            >
              {/* Question metadata */}
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <div>
                  <span className="text-[10px] font-bold text-indigo-400 uppercase tracking-wider block">
                    {q.mediaOutlet} • {q.journalist}
                  </span>
                  <span className="text-xs text-slate-400">Argomento: {q.topic}</span>
                </div>
              </div>

              {/* Question Text */}
              <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 text-sm text-slate-100 font-medium italic">
                "{q.questionText}"
              </div>

              {/* Answers options */}
              <div className="space-y-2.5">
                {q.answers.map((ans, idx) => {
                  const isSelected = chosenIndex === idx;

                  return (
                    <div
                      key={idx}
                      onClick={() => setSelectedAnswers({ ...selectedAnswers, [q.id]: idx })}
                      className={`p-4 rounded-xl border cursor-pointer transition-all ${
                        isSelected
                          ? ans.isOptimal
                            ? 'bg-emerald-950/60 border-emerald-500 text-white shadow-lg shadow-emerald-950/40'
                            : 'bg-indigo-950/60 border-indigo-500 text-white shadow-lg'
                          : 'bg-slate-950/50 border-slate-800/80 hover:border-slate-700 text-slate-300'
                      }`}
                    >
                      <div className="flex items-start justify-between">
                        <div className="space-y-1">
                          <div className="flex items-center space-x-2">
                            <span className="text-xs font-bold px-2 py-0.5 rounded bg-slate-800 text-slate-300">
                              Tono: {ans.tone}
                            </span>
                            {ans.isOptimal && (
                              <span className="text-[10px] font-bold bg-emerald-500/20 text-emerald-400 px-1.5 py-0.2 rounded border border-emerald-500/30 flex items-center gap-1">
                                <CheckCircle className="w-3 h-3" /> Ottimale in FM26
                              </span>
                            )}
                          </div>
                          <p className="text-xs font-sans font-medium text-slate-100 pt-1">
                            {ans.text}
                          </p>
                        </div>
                      </div>

                      {/* Feedback when selected */}
                      {isSelected && (
                        <div className="mt-3 pt-3 border-t border-slate-800/80 grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                          <div className="bg-slate-900/90 p-2 rounded-lg text-emerald-400">
                            <strong>Impatto Spogliatoio:</strong> {ans.squadImpact}
                          </div>
                          <div className="bg-slate-900/90 p-2 rounded-lg text-indigo-300">
                            <strong>Impatto Stampa:</strong> {ans.mediaImpact}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
