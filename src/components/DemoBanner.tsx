export default function DemoBanner() {
  return (
    <a
      href="https://davidmasterson.co/"
      target="_blank"
      rel="noopener noreferrer"
      className="group block w-full bg-[#0A0A0A] border-b border-[#EDE8DF]/8 hover:bg-[#0F0F0F] transition-colors duration-300 cursor-pointer"
    >
      <div className="flex items-center justify-center gap-3 px-6 py-2.5">
        <span
          className="font-sans text-[#EDE8DF]/50 text-[0.65rem] tracking-[0.2em] uppercase font-medium"
        >
          Demo project by
        </span>
        <span className="w-px h-3 bg-[#EDE8DF]/15" />
        <span
          className="font-sans text-[#EDE8DF] text-[0.68rem] tracking-[0.2em] uppercase font-medium group-hover:text-[#EDE8DF]/80 transition-colors duration-300"
        >
          David Masterson.
        </span>
        <span className="w-px h-3 bg-[#EDE8DF]/15" />
        <span className="font-sans text-[#EDE8DF]/40 text-[0.65rem] tracking-[0.15em] uppercase font-light group-hover:text-[#EDE8DF]/60 transition-colors duration-300">
          View Portfolio ↗
        </span>
      </div>
    </a>
  );
}
