
import React, { useState } from 'react';
import ClawSynthesizer from './components/ClawSynthesizer';
import AssistantVoice from './components/AssistantVoice';

const App: React.FC = () => {
  const [isAssistantOpen, setIsAssistantOpen] = useState(false);

  return (
    <div className="min-h-screen p-4 md:p-12 flex flex-col">
      {/* Header */}
      <header className="flex flex-col md:flex-row justify-between items-start md:items-center mb-12 space-y-4 md:space-y-0">
        <div>
          <h1 className="text-4xl font-serif font-bold text-white tracking-tighter">
            CLAW BOT <span className="text-blue-500">VOICE ENGINE</span>
          </h1>
          <p className="text-white/40 text-sm font-mono tracking-widest mt-1 uppercase">
            Developed by Karren Tonoyan | Automation & AI Specialist
          </p>
        </div>
        
        <div className="flex items-center space-x-4">
          <button 
            onClick={() => setIsAssistantOpen(true)}
            className="flex items-center space-x-2 bg-white/5 border border-white/10 hover:border-blue-500 hover:text-blue-400 px-6 py-2 rounded-full transition-all text-xs font-bold uppercase tracking-widest"
          >
            <span>Talk to Karren's AI</span>
          </button>
          <div className="w-10 h-10 bg-blue-600 rounded-full flex items-center justify-center font-bold shadow-lg shadow-blue-500/20">
            KT
          </div>
        </div>
      </header>

      {/* Main Synthesizer */}
      <main className="flex-grow">
        <ClawSynthesizer />
      </main>

      {/* Footer Info */}
      <footer className="mt-20 pt-8 border-t border-white/5 grid md:grid-cols-3 gap-8 opacity-60 hover:opacity-100 transition-opacity">
        <div className="space-y-2">
          <p className="text-[10px] font-bold text-blue-400 uppercase tracking-widest">O Karrenie</p>
          <p className="text-xs leading-relaxed">
            Deweloper, psycholog i poliglota. Twórca systemów anty-halucynacyjnych i domowej terapii AI.
          </p>
        </div>
        <div className="space-y-2">
          <p className="text-[10px] font-bold text-blue-400 uppercase tracking-widest">Technologia</p>
          <p className="text-xs leading-relaxed">
            Gemini 2.5 Native Audio Engine. Przetwarzanie PCM 24kHz. Architektura bezserwerowa.
          </p>
        </div>
        <div className="space-y-2">
          <p className="text-[10px] font-bold text-blue-400 uppercase tracking-widest">Status Systemu</p>
          <div className="flex items-center space-x-2 text-xs">
            <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></span>
            <span>Claw Bot Core: Active</span>
          </div>
        </div>
      </footer>

      {isAssistantOpen && (
        <AssistantVoice onClose={() => setIsAssistantOpen(false)} />
      )}
    </div>
  );
};

export default App;
