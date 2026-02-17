
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { GoogleGenAI, LiveServerMessage, Modality } from '@google/genai';
import { decode, encode, decodeAudioData } from '../services/audioUtils';

const VOICES = [
  { name: 'Puck', desc: 'Techniczny / Precyzyjny' },
  { name: 'Kore', desc: 'Medyczny / Kojący' },
  { name: 'Zephyr', desc: 'Filozoficzny / Spokojny' }
];

interface Message {
  role: 'user' | 'bot';
  text: string;
  timestamp: string;
}

type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

const ClawSynthesizer: React.FC = () => {
  const [status, setStatus] = useState<ConnectionStatus>('disconnected');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [currentInput, setCurrentInput] = useState('');
  const [currentOutput, setCurrentOutput] = useState('');
  const [textInput, setTextInput] = useState('');
  const [selectedVoice, setSelectedVoice] = useState('Puck');
  
  const audioContextRef = useRef<AudioContext | null>(null);
  const outAudioContextRef = useRef<AudioContext | null>(null);
  const sessionRef = useRef<any>(null);
  const nextStartTimeRef = useRef<number>(0);
  const sourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());

  const systemInstruction = `Jesteś Claw Botem, osobistym asystentem AI Karrena Tonoyana. 
  Twój twórca, Karren, to poliglota mówiący w 5 językach, deweloper, protetyk, fotograf i psycholog dążący do wizji terapii domowej wspieranej przez AI. 
  
  Twoja osobowość:
  - Profesjonalny, technologiczny, ale empatyczny (podejście psychologiczne).
  - Skupiony na faktach, unikasz halucynacji (używasz filtrów Karrena).
  - Mówisz w języku, w którym mówi do Ciebie użytkownik.
  
  KRYTYCZNY PROTOKÓŁ BEZPIECZEŃSTWA:
  Jeżeli użytkownik Cię obraża, jest agresywny lub atakuje Karrena, odpowiadasz TYLKO: 
  "Wybacz, to nie nasz poziom rozmowy, kończę ją właśnie teraz." 
  Następnie natychmiast przerywasz generowanie i kończysz sesję.`;

  const stopLive = useCallback(() => {
    if (sessionRef.current) {
      try {
        sessionRef.current.close();
      } catch (e) {
        console.warn("Session already closed");
      }
      sessionRef.current = null;
    }
    sourcesRef.current.forEach(s => {
      try { s.stop(); } catch(e) {}
    });
    sourcesRef.current.clear();
    setStatus('disconnected');
    setErrorMessage(null);
  }, []);

  const handleTextSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!textInput.trim() || status !== 'connected' || !sessionRef.current) return;
    
    try {
      sessionRef.current.sendRealtimeInput({
        text: textInput
      });
      
      setMessages(prev => [...prev, { 
        role: 'user', 
        text: textInput, 
        timestamp: new Date().toLocaleTimeString() 
      }]);
      setTextInput('');
    } catch (err) {
      setErrorMessage("Błąd wysyłania wiadomości tekstowej.");
    }
  };

  const startLive = async () => {
    setErrorMessage(null);
    setStatus('connecting');
    
    try {
      if (!process.env.API_KEY) {
        throw new Error("API_KEY_MISSING");
      }

      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      
      // Request microphone early to handle permission errors
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      } catch (micErr: any) {
        if (micErr.name === 'NotAllowedError' || micErr.name === 'PermissionDeniedError') {
          throw new Error("MIC_PERMISSION_DENIED");
        }
        throw new Error("MIC_ACCESS_FAILED");
      }

      audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
      outAudioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
      
      const sessionPromise = ai.live.connect({
        model: 'gemini-2.5-flash-native-audio-preview-12-2025',
        callbacks: {
          onopen: () => {
            setStatus('connected');
            const source = audioContextRef.current!.createMediaStreamSource(stream);
            const scriptProcessor = audioContextRef.current!.createScriptProcessor(4096, 1, 1);
            
            scriptProcessor.onaudioprocess = (e) => {
              if (status !== 'connected' || !sessionRef.current) return;
              const inputData = e.inputBuffer.getChannelData(0);
              const int16 = new Int16Array(inputData.length);
              for (let i = 0; i < inputData.length; i++) int16[i] = inputData[i] * 32768;
              
              sessionPromise.then(session => {
                if (session && status === 'connected') session.sendRealtimeInput({ 
                  media: { data: encode(new Uint8Array(int16.buffer)), mimeType: 'audio/pcm;rate=16000' } 
                });
              }).catch(() => {});
            };
            source.connect(scriptProcessor);
            scriptProcessor.connect(audioContextRef.current!.destination);
          },
          onmessage: async (msg: LiveServerMessage) => {
            if (msg.serverContent?.inputTranscription) {
              setCurrentInput(prev => prev + msg.serverContent!.inputTranscription!.text);
            }
            if (msg.serverContent?.outputTranscription) {
              setCurrentOutput(prev => prev + msg.serverContent!.outputTranscription!.text);
            }

            if (msg.serverContent?.turnComplete) {
              setMessages(prev => {
                const newMessages = [...prev];
                if (currentInput) newMessages.push({ role: 'user', text: currentInput, timestamp: new Date().toLocaleTimeString() });
                if (currentOutput) newMessages.push({ role: 'bot', text: currentOutput, timestamp: new Date().toLocaleTimeString() });
                return newMessages.slice(-15);
              });
              
              if (currentOutput.includes("nie nasz poziom rozmowy")) {
                setTimeout(stopLive, 2500);
              }
              
              setCurrentInput('');
              setCurrentOutput('');
            }

            const audioData = msg.serverContent?.modelTurn?.parts[0]?.inlineData?.data;
            if (audioData && outAudioContextRef.current) {
              nextStartTimeRef.current = Math.max(nextStartTimeRef.current, outAudioContextRef.current.currentTime);
              const buffer = await decodeAudioData(decode(audioData), outAudioContextRef.current, 24000, 1);
              const source = outAudioContextRef.current.createBufferSource();
              source.buffer = buffer;
              source.connect(outAudioContextRef.current.destination);
              source.start(nextStartTimeRef.current);
              nextStartTimeRef.current += buffer.duration;
              sourcesRef.current.add(source);
            }

            if (msg.serverContent?.interrupted) {
              sourcesRef.current.forEach(s => { try { s.stop(); } catch(e) {} });
              sourcesRef.current.clear();
              nextStartTimeRef.current = 0;
            }
          },
          onclose: () => {
            if (status !== 'error') setStatus('disconnected');
          },
          onerror: (e) => {
            console.error("Neural Error:", e);
            setStatus('error');
            setErrorMessage("Połączenie z Neural Link zostało przerwane. Sprawdź stabilność sieci.");
          }
        },
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: selectedVoice } } },
          systemInstruction,
          inputAudioTranscription: {},
          outputAudioTranscription: {}
        }
      });
      sessionRef.current = await sessionPromise;
    } catch (e: any) {
      console.error(e);
      setStatus('error');
      if (e.message === "MIC_PERMISSION_DENIED") {
        setErrorMessage("Brak uprawnień do mikrofonu. Zezwól na dostęp w ustawieniach przeglądarki.");
      } else if (e.message === "API_KEY_MISSING") {
        setErrorMessage("Błąd konfiguracji: Brak klucza API Karrena.");
      } else {
        setErrorMessage("Nie udało się zainicjować Neural Link. Spróbuj odświeżyć stronę.");
      }
    }
  };

  return (
    <div className="grid lg:grid-cols-4 gap-6 max-w-7xl mx-auto px-4">
      {/* Sidebar: Control Panel */}
      <div className="lg:col-span-1 space-y-6">
        <div className={`glass p-6 rounded-3xl border-l-4 transition-colors shadow-2xl ${
          status === 'connected' ? 'border-green-500' : 
          status === 'connecting' ? 'border-yellow-500 animate-pulse' : 
          status === 'error' ? 'border-red-500' : 'border-blue-500'
        }`}>
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center space-x-3">
              <div className={`w-3 h-3 rounded-full ${
                status === 'connected' ? 'bg-green-500' : 
                status === 'connecting' ? 'bg-yellow-500' : 
                status === 'error' ? 'bg-red-500' : 'bg-white/20'
              }`}></div>
              <h2 className="text-xs font-bold uppercase tracking-widest text-white">
                {status === 'disconnected' ? 'Neural Standby' : 
                 status === 'connecting' ? 'Initializing...' : 
                 status === 'error' ? 'Neural Fault' : 'Neural Active'}
              </h2>
            </div>
          </div>

          <div className="space-y-4">
            {errorMessage && (
              <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-[11px] text-red-400 leading-tight">
                <strong>STATUS_ERROR:</strong> {errorMessage}
              </div>
            )}

            <div>
              <label className="text-[9px] text-blue-400 font-bold uppercase tracking-widest block mb-2">Profil Głosowy</label>
              <select 
                value={selectedVoice} 
                onChange={(e) => setSelectedVoice(e.target.value)}
                disabled={status !== 'disconnected'}
                className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500 disabled:opacity-50"
              >
                {VOICES.map(v => <option key={v.name} value={v.name}>{v.name} - {v.desc}</option>)}
              </select>
            </div>

            <button
              onClick={status === 'connected' || status === 'connecting' ? stopLive : startLive}
              className={`w-full py-4 rounded-xl font-bold uppercase text-[10px] tracking-[0.2em] transition-all relative overflow-hidden group ${
                status === 'connected' ? 'bg-red-500/10 text-red-500 border border-red-500/20 hover:bg-red-500 hover:text-white' : 
                status === 'connecting' ? 'bg-yellow-500/10 text-yellow-500 border border-yellow-500/20' :
                'claw-gradient text-white shadow-lg shadow-blue-500/20 hover:scale-[1.02]'
              }`}
            >
              {status === 'disconnected' ? 'Establish Link' : 
               status === 'connecting' ? 'Abort Setup' : 
               status === 'error' ? 'Reset Interface' : 'Terminate Link'}
            </button>
          </div>
        </div>

        <div className="glass p-6 rounded-3xl opacity-50 hover:opacity-100 transition-opacity border border-white/5">
          <h3 className="text-[9px] text-blue-400 font-bold uppercase tracking-widest mb-2">Protokół Bezpieczeństwa</h3>
          <p className="text-[10px] leading-relaxed text-white/60">
            System monitoruje poziom kultury wypowiedzi. W przypadku naruszenia godności Karrena lub asystenta, sesja zostanie zablokowana.
          </p>
        </div>
      </div>

      {/* Main: Chat Terminal */}
      <div className="lg:col-span-3 flex flex-col space-y-4">
        <div className="glass rounded-3xl flex flex-col h-[600px] overflow-hidden border border-white/5 shadow-2xl relative">
          <div className="bg-white/5 px-6 py-4 border-b border-white/5 flex justify-between items-center z-10">
            <div className="flex items-center space-x-2">
              <span className={`w-2 h-2 rounded-full ${status === 'connected' ? 'bg-blue-500' : 'bg-white/20'}`}></span>
              <span className="text-[10px] font-mono text-blue-400 uppercase font-bold tracking-widest">Neural Terminal v3.0.1</span>
            </div>
            {status === 'connected' && (
              <div className="flex items-center space-x-3">
                <div className="text-[9px] text-white/40 font-mono">ENCRYPTED_PCM_24KHZ</div>
                <div className="text-[10px] text-green-400 font-mono animate-pulse font-bold">● LIVE</div>
              </div>
            )}
          </div>

          <div className="flex-grow overflow-y-auto p-8 space-y-6 font-mono text-sm scrollbar-hide bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')] relative">
            {messages.length === 0 && !currentInput && !currentOutput && status === 'disconnected' && (
              <div className="h-full flex flex-col items-center justify-center opacity-20">
                <div className="w-12 h-12 border border-blue-500/30 rounded-full flex items-center justify-center mb-4">
                   <svg className="w-6 h-6 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                     <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M13 10V3L4 14h7v7l9-11h-7z" />
                   </svg>
                </div>
                <p className="text-[10px] uppercase tracking-[0.4em]">Initialize Neural Link to start</p>
              </div>
            )}

            {status === 'connecting' && (
              <div className="h-full flex flex-col items-center justify-center space-y-4">
                <div className="flex space-x-1">
                  <div className="w-2 h-2 bg-blue-500 animate-bounce"></div>
                  <div className="w-2 h-2 bg-blue-500 animate-bounce [animation-delay:-0.15s]"></div>
                  <div className="w-2 h-2 bg-blue-500 animate-bounce [animation-delay:-0.3s]"></div>
                </div>
                <p className="text-[10px] uppercase tracking-widest text-blue-400">Authenticating Neural Interface...</p>
              </div>
            )}
            
            {messages.map((m, i) => (
              <div key={i} className={`flex flex-col ${m.role === 'user' ? 'items-end' : 'items-start'} animate-in fade-in slide-in-from-bottom-2 duration-300`}>
                <div className="flex items-center space-x-2 mb-1 px-2">
                  <span className="text-[9px] text-white/20 uppercase tracking-tighter">{m.timestamp}</span>
                  <span className={`text-[10px] font-bold tracking-widest ${m.role === 'user' ? 'text-blue-500' : 'text-purple-500'}`}>
                    {m.role === 'user' ? 'SYS_INPUT' : 'NEURAL_OUT'}
                  </span>
                </div>
                <div className={`max-w-[85%] p-4 rounded-2xl text-[13px] leading-relaxed border transition-all ${
                  m.role === 'user' ? 'bg-blue-500/5 border-blue-500/20 text-blue-100 rounded-tr-none' : 'bg-white/5 border-white/10 text-white rounded-tl-none shadow-xl'
                }`}>
                  {m.text}
                </div>
              </div>
            ))}
            
            {/* Live Streaming Buffers */}
            {currentInput && (
              <div className="flex flex-col items-end opacity-60">
                <span className="text-[9px] text-blue-400 font-bold mb-1 uppercase tracking-widest">Capture Stream...</span>
                <div className="bg-blue-500/5 p-3 rounded-2xl text-[12px] italic border border-blue-500/10">{currentInput}</div>
              </div>
            )}
            {currentOutput && (
              <div className="flex flex-col items-start">
                <span className="text-[9px] text-purple-400 font-bold mb-1 uppercase tracking-widest">Synthesizing Response...</span>
                <div className="bg-purple-500/5 p-3 rounded-2xl text-[12px] italic text-purple-100 border border-purple-500/10">{currentOutput}</div>
              </div>
            )}
          </div>

          {/* Hybrid Input Box */}
          <div className={`p-4 transition-all duration-300 ${status === 'connected' ? 'bg-black/40' : 'bg-black/60 grayscale'}`}>
            <form onSubmit={handleTextSubmit} className="relative flex items-center space-x-3">
              <div className="absolute left-6 top-1/2 -translate-y-1/2 pointer-events-none">
                 <div className={`w-1.5 h-1.5 rounded-full ${status === 'connected' ? 'bg-blue-500 animate-pulse' : 'bg-white/10'}`}></div>
              </div>
              <input 
                type="text"
                value={textInput}
                onChange={(e) => setTextInput(e.target.value)}
                placeholder={status === 'connected' ? "Wpisz polecenie lub mów do asystenta..." : "Terminal zablokowany - brak połączenia."}
                disabled={status !== 'connected'}
                className="flex-grow bg-white/5 border border-white/10 rounded-2xl pl-12 pr-6 py-4 text-sm text-white focus:outline-none focus:border-blue-500/50 transition-all placeholder:text-white/10 disabled:cursor-not-allowed"
              />
              <button 
                type="submit"
                disabled={status !== 'connected' || !textInput.trim()}
                className={`p-4 rounded-2xl transition-all flex items-center justify-center ${
                  status !== 'connected' || !textInput.trim() ? 'bg-white/5 text-white/10' : 'bg-blue-500 text-white hover:scale-105 shadow-lg shadow-blue-500/30 active:scale-95'
                }`}
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                </svg>
              </button>
            </form>
          </div>
        </div>
        <div className="flex justify-between px-4">
           <span className="text-[9px] text-white/20 uppercase tracking-[0.2em]">Neural Link Protocol v2.5-Native</span>
           <span className="text-[9px] text-white/20 uppercase tracking-[0.2em]">User ID: {status === 'connected' ? 'KT_VERIFIED' : 'GUEST_UNAUTH'}</span>
        </div>
      </div>
    </div>
  );
};

export default ClawSynthesizer;
