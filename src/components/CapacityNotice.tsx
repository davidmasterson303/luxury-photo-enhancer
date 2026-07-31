interface CapacityNoticeProps {
  onDismiss: () => void;
}

/* Shown when the day's generation budget is spent, instead of the red
 * error path. Running out of capacity is a normal operating state for a
 * demo on a personal API key, and it should read like the house is full
 * rather than like something broke. */
export default function CapacityNotice({ onDismiss }: CapacityNoticeProps) {
  return (
    <div className="w-full max-w-2xl mx-auto text-center animate-fade-up" role="status">
      <div className="border border-[#111111]/12 bg-white px-8 sm:px-14 py-14 sm:py-20">
        <p className="text-xs tracking-widest uppercase text-luxury-gray-light font-light mb-8">
          The Atelier
        </p>

        <div className="h-px w-16 mx-auto bg-[#111111]/20 mb-8" />

        <h2 className="font-serif italic text-2xl sm:text-3xl md:text-4xl font-light text-[#111111] mb-6 leading-tight">
          Fully booked today
        </h2>

        <p className="text-sm text-luxury-gray-medium leading-relaxed max-w-md mx-auto font-light mb-10">
          The atelier has reached its sitting capacity for the day. Please
          return tomorrow and we will be glad to receive you.
        </p>

        <p className="text-xs text-luxury-gray-light leading-relaxed max-w-md mx-auto font-light mb-10">
          This is a portfolio demonstration running on a metered image model,
          with a daily ceiling so it cannot run up an unbounded bill.
        </p>

        <button
          onClick={onDismiss}
          className="px-10 sm:px-14 py-4 bg-[#111111] text-white text-xs tracking-widest uppercase font-medium min-h-[52px] hover:bg-[#111111]/80 transition-colors duration-500 focus:outline-none focus:ring-1 focus:ring-[#111111] focus:ring-offset-2 cursor-pointer"
        >
          Return to Start
        </button>
      </div>
    </div>
  );
}
