import { useEffect, useState } from 'react';

const PHASES = [
  'Analyzing structure',
  'Refining lighting',
  'Developing portrait',
];

export default function LoadingState() {
  const [phaseIndex, setPhaseIndex] = useState(0);

  useEffect(() => {
    const id = setInterval(() => {
      setPhaseIndex(i => (i + 1) % PHASES.length);
    }, 2400);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="fixed inset-0 bg-[#F9F9F8] z-50 flex items-center justify-center p-8">
      <div className="w-full max-w-xs mx-auto text-center">

        {/* Cycling phase text */}
        <div className="relative h-5 mb-8 overflow-hidden">
          {PHASES.map((phase, i) => (
            <p
              key={phase}
              className="absolute inset-0 text-xs tracking-widest uppercase text-[#111111] flex items-center justify-center transition-opacity duration-700"
              style={{ opacity: i === phaseIndex ? 1 : 0 }}
            >
              {phase}
            </p>
          ))}
        </div>

        {/* Structural progress line */}
        <div className="w-full h-[1px] bg-[#111111]/10 overflow-hidden relative">
          <div className="absolute top-0 left-0 h-full w-1/2 bg-[#111111] line-sweep" />
        </div>

        <p className="text-xs tracking-widest uppercase text-[#111111]/30 mt-8">
          Typically completes in 30 seconds
        </p>
      </div>
    </div>
  );
}
