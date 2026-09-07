import { forwardRef, type ReactNode } from "react";

type ArcaneFrameProps = {
  children: ReactNode;
  className?: string;
  state?: "idle" | "loading" | "success" | "error";
};

export const ArcaneFrame = forwardRef<HTMLDivElement, ArcaneFrameProps>(
  ({ children, className = "", state = "idle" }, ref) => (
    <div ref={ref} className={`arcane-auth-frame ${className}`} data-state={state}>
      <span className="arcane-auth-frame__light-sweep" aria-hidden="true" />
      <svg className="arcane-auth-frame__outline" viewBox="0 0 520 680" preserveAspectRatio="none" aria-hidden="true">
        <defs>
          <linearGradient id="frame-stroke" x1="18" y1="8" x2="500" y2="670">
            <stop stopColor="#9cb7ff" stopOpacity="0.16" />
            <stop offset="0.42" stopColor="#ad9dff" stopOpacity="0.72" />
            <stop offset="1" stopColor="#6756bc" stopOpacity="0.18" />
          </linearGradient>
        </defs>
        <path d="M34 2h452l32 32v612l-32 32H34L2 646V34L34 2Z" stroke="url(#frame-stroke)" />
        <path d="M56 15H25v31M464 15h31v31M56 665H25v-31m439 31h31v-31" stroke="#c0b9ff" strokeOpacity="0.58" />
        <path d="m25 25 18 8-10 10-8-18Zm470 0-18 8 10 10 8-18ZM25 655l18-8-10-10-8 18Zm470 0-18-8 10-10 8 18Z" stroke="#9284ec" strokeOpacity="0.65" />
        <path d="M86 2h73l8 7h186l8-7h73M86 678h73l8-7h186l8 7h73" stroke="#756ac8" strokeOpacity="0.34" />
      </svg>
      <span className="arcane-auth-frame__corner arcane-auth-frame__corner--tl" aria-hidden="true" />
      <span className="arcane-auth-frame__corner arcane-auth-frame__corner--tr" aria-hidden="true" />
      <span className="arcane-auth-frame__corner arcane-auth-frame__corner--bl" aria-hidden="true" />
      <span className="arcane-auth-frame__corner arcane-auth-frame__corner--br" aria-hidden="true" />
      <div className="arcane-auth-frame__content">{children}</div>
    </div>
  ),
);

ArcaneFrame.displayName = "ArcaneFrame";

export function AccessSigil() {
  return (
    <div className="access-sigil" aria-hidden="true">
      <svg viewBox="0 0 132 132" focusable="false">
        <g className="access-sigil__orbit">
          <circle cx="66" cy="66" r="54" stroke="#8c7ee6" strokeDasharray="2 7 19 8" strokeOpacity="0.62" />
          <circle cx="66" cy="66" r="44" stroke="#a28fff" strokeDasharray="36 12" strokeOpacity="0.54" />
        </g>
        <g className="access-sigil__mark">
          <path d="m66 24 9 27 24 15-24 15-9 27-9-27-24-15 24-15 9-27Z" fill="#7258ff" fillOpacity="0.2" stroke="#d8d3ff" />
          <path d="m66 39 8 27-8 27-8-27 8-27Z" fill="#9d91ff" fillOpacity="0.56" stroke="#eeeaff" />
          <circle cx="66" cy="66" r="7" fill="#f5f2ff" />
        </g>
      </svg>
      <span className="access-sigil__pulse" />
    </div>
  );
}

export default ArcaneFrame;
