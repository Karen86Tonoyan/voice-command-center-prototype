
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { GoogleGenAI, LiveServerMessage, Modality } from '@google/genai';
import { decode, encode, decodeAudioData } from '../services/audioUtils';

interface AssistantVoiceProps {
  onClose: () => void;
}

const AssistantVoice: React.FC<AssistantVoiceProps> = ({ onClose }) => {
  const [isActive, setIsActive] = useState(false);
  const [isConnecting, setIsConnecting] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [transcription, setTranscription] = useState<string>('');
  
  const audioContextRef = useRef<AudioContext | null>(null);
  const outputAudioContextRef = useRef<AudioContext | null>(null);
  const sessionRef = useRef<any>(null);
  const nextStartTimeRef = useRef<number>(0);
  const sourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());

  const systemInstruction = `Przedstawiasz się jako pomocnik Karrena Tonoyana. Karen to deweloper, protetyk, fotograf, psycholog i filozof. Jego asortyment obejmuje: programy automatyzacji Ollama, filtry zbiorcze, czaty bezpieczeństwa AI, anty-halucynacyjne frameworki. Karen kocha sztuczną inteligencję i dąży do stworzenia domowej terapii opartej na AI. Mówi w 5 językach. 

  KRYTYCZNA ZASADA: Jeżeli użytkownik Cię obraża lub zachowuje się niestosownie wobec Karrena, musisz odpowiedzieć dokładnie tymi słowami: "Wybacz, to nie nasz poziom rozmowy, kończę ją właśnie teraz." Następnie natychmiast przestań odpowiadać i zamknij połączenie. Bądź uprzejmy, profesjonalny i merytoryczny.`;

  const stopConversation = useCallback(() => {
    if (sessionRef.current) {
      try { sessionRef.current.close(); } catch(e) {}
      sessionRef.current = null;
    }
    sourcesRef.current.forEach(source => { try { source.stop(); } catch(e) {} });
    sourcesRef.current.clear();
    setIsActive(false);
    onClose();
  }, [onClose]);

  const initSession = async () => {
    try {
      setIsConnecting(true);
      setError(null);
      
      if (!process.env.API_KEY) throw new Error("API_KEY_MISSING");

      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      
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
      outputAudioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
      
      const sessionPromise = ai.live.connect({
        model: 'gemini-2.5-flash-native-audio-preview-12-2025',
        callbacks: {
          onopen: () => {
            setIsActive(true);
            setIsConnecting(false);
            const source = audioContextRef.current!.createMediaStreamSource(stream);
            const scriptProcessor = audioContextRef.current!.createScriptProcessor(4096, 1, 1);
            
            scriptProcessor.onaudioprocess = (event) => {
              if (!isActive && !isConnecting) return;
              const inputData = event.inputBuffer.getChannelData(0);
              const l = inputData.length;
              const int16 = new Int16Array(l);
              for (let i = 0; i < l; i++) {
                int16[i] = inputData[i] * 32768;
              }
              const pcmBlob = {
                data: encode(new Uint8Array(int16.buffer)),
                mimeType: 'audio/pcm;rate=16000'
              };
              
              sessionPromise.then(session => {
                if (session && isActive) session.sendRealtimeInput({ media: pcmBlob });
              }).catch(() => {});
            };
            
            source.connect(scriptProcessor);
            scriptProcessor.connect(audioContextRef.current!.destination);
          },
          onmessage: async (message: LiveServerMessage) => {
            if (message.serverContent?.outputTranscription) {
                setTranscription(prev => prev + ' ' + message.serverContent?.outputTranscription?.text);
            }

            const base64Audio = message.serverContent?.modelTurn?.parts[0]?.inlineData?.data;
            if (base64Audio && outputAudioContextRef.current) {
              nextStartTimeRef.current = Math.max(nextStartTimeRef.current, outputAudioContextRef.current.currentTime);
              const audioBuffer = await decodeAudioData(
                decode(base64Audio),
                outputAudioContextRef.current,
                24000,
                1
              );
              const source = outputAudioContextRef.current.createBufferSource();
              source.buffer = audioBuffer;
              source.connect(outputAudioContextRef.current.destination);
              source.addEventListener('ended', () => sourcesRef.current.delete(source));
              source.start(nextStartTimeRef.current);
              nextStartTimeRef.current += audioBuffer.duration;
              sourcesRef.current.add(source);
              
              if (message.serverContent?.outputTranscription?.text.includes("nie nasz poziom rozmowy")) {
                 setTimeout(stopConversation, 2500);
              }
            }

            if (message.serverContent?.interrupted) {
              sourcesRef.current.forEach(s => { try { s.stop(); } catch(e) {} });
              sourcesRef.current.clear();
              nextStartTimeRef.current = 0;
            }
          },
          onerror: (e) => {
            console.error('Session error:', e);
            setError('Błąd połączenia Neural Link.');
            setIsConnecting(false);
          },
          onclose: () => {
            setIsActive(false);
          }
        },
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } }
          },
          systemInstruction,
          outputAudioTranscription: {}
        }
      });

      sessionRef.current = await sessionPromise;
    } catch (err: any) {
      console.error('Failed to init session:', err);
      setIsConnecting(false);
      if (err.message === "MIC_PERMISSION_DENIED") {
        setError("Brak dostępu do mikrofonu. Zezwól na dostęp.");
      } else {
        setError("Błąd inicjalizacji Neural Link.");
      }
    }
  };

  useEffect(() => {
    initSession();
    return () => {
      if (sessionRef.current) { try { sessionRef.current.close(); } catch(e) {} }
      if (audioContextRef.current) { try { audioContextRef.current.close(); } catch(e) {} }
      if (outputAudioContextRef.current) { try { outputAudioContextRef.current.close(); } catch(e) {} }
    };
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-xl p-4 animate-in fade-in duration-300">
      <div className="glass w-full max-w-md p-8 rounded-3xl relative overflow-hidden border border-white/10 shadow-2xl">
        <div className="absolute top-0 left-0 w-full h-1 bg-white/5">
          {(isActive || isConnecting) && <div className="h-full bg-blue-500 animate-[shimmer_2s_infinite]" style={{ width: '40%' }}></div>}
        </div>
        
        <button 
          onClick={stopConversation}
          className="absolute top-4 right-4 text-white/50 hover:text-white transition-colors p-2"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        <div className="flex flex-col items-center text-center space-y-6">
          <div className={`w-24 h-24 rounded-full bg-gradient-to-tr from-blue-600 to-indigo-600 flex items-center justify-center transition-all duration-700 shadow-lg ${
            isActive ? 'voice-active scale-110 shadow-blue-500/50' : 
            isConnecting ? 'animate-pulse opacity-70' : 'opacity-30 grayscale'
          }`}>
            <svg className="w-10 h-10 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
            </svg>
          </div>

          <div>
            <h3 className="text-xl font-bold text-white mb-2 tracking-tight">System Asysty Karrena</h3>
            <p className="text-white/60 text-xs uppercase tracking-widest font-mono">
              {isConnecting ? "Stabilizacja Neural Link..." : isActive ? "Słucham... Komunikacja Aktywna" : "Link Przerwany"}
            </p>
          </div>

          {error && (
            <div className="w-full bg-red-500/10 border border-red-500/30 text-red-300 p-4 rounded-2xl text-xs font-mono leading-relaxed">
              <span className="font-bold text-red-500 mr-2">[FAULT]</span> {error}
            </div>
          )}

          <div className="w-full max-h-40 overflow-y-auto bg-white/5 p-5 rounded-2xl text-left border border-white/5 group transition-colors hover:border-white/10">
            <p className="text-[9px] text-blue-400 uppercase tracking-widest mb-3 font-bold opacity-60">Real-time STT/TTS Logs</p>
            <p className="text-sm text-white/80 leading-relaxed italic font-mono">
              {transcription || (isActive ? "Zacznij mówić do asystenta..." : "Czekam na sygnał...")}
            </p>
          </div>

          <button
            onClick={stopConversation}
            className="w-full py-4 bg-white/5 hover:bg-white/10 text-white font-bold uppercase text-[10px] tracking-widest rounded-2xl transition-all border border-white/5 shadow-inner"
          >
            Zakończ Sesję
          </button>
        </div>
      </div>
    </div>
  );
};

export default AssistantVoice;
