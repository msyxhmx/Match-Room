// The component lab: every component in every state, on both canvases (DESIGN §6.1).
// Dev only: lab.html is not a build input, so none of this ships.
//
//   /lab.html                  index, all components
//   /lab.html?c=MomentCard     one component
//   /lab.html?shot=<id>        one frame at 1:1, no chrome (what scripts/shots.mjs captures)
//   &guides=1                  draw the EBU R 95 safe area

import { Component, type ReactNode } from "react";
import { clubSlots } from "../clubColours";
import { LabelsProvider } from "../ui/labels";
import type { Canvas, LabModule, LabState } from "./types";

const modules = Object.values(
  import.meta.glob<{ default: LabModule }>("../ui/**/*.lab.tsx", { eager: true }),
)
  .map((m) => m.default)
  .sort((a, b) => a.component.localeCompare(b.component));

export const SIZES: Record<Canvas, { width: number; height: number }> = {
  video: { width: 1920, height: 1080 },
  phone: { width: 390, height: 844 },
};

export interface ShotInfo {
  id: string;
  component: string;
  state: string;
  canvas: Canvas;
  note: string;
  width: number;
  height: number;
  transparent: boolean;
}

function shotId(mod: LabModule, state: LabState, canvas: Canvas) {
  return `${mod.component}--${state.name}--${canvas}`;
}

function canvasesOf(state: LabState): Canvas[] {
  return state.canvases ?? ["video", "phone"];
}

export const shots: ShotInfo[] = modules.flatMap((mod) =>
  mod.states.flatMap((state) =>
    canvasesOf(state).map((canvas) => ({
      id: shotId(mod, state, canvas),
      component: mod.component,
      state: state.name,
      canvas,
      note: state.note,
      ...SIZES[canvas],
      transparent: state.background === "transparent",
    })),
  ),
);

class Boundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  render() {
    return this.state.error ? (
      <div className="lab-error" data-lab-error>
        {String(this.state.error.stack ?? this.state.error)}
      </div>
    ) : (
      this.props.children
    );
  }
}

function Frame(props: {
  mod: LabModule;
  state: LabState;
  canvas: Canvas;
  guides: boolean;
  forShot?: boolean;
}) {
  const { mod, state, canvas, guides, forShot } = props;
  const place = state.place ?? "center";
  const background = state.background ?? "ground";
  const clubs = state.clubs ?? { home: "NGC", away: "KST" };
  const { width, height } = SIZES[canvas];
  const classes = [
    "lab-frame",
    "mr-root",
    canvas === "video" ? "video" : "phone",
    place === "fill" ? "place-fill" : `pad place-${place}`,
    forShot && background === "transparent" ? "shot-transparent" : `bg-${background}`,
  ];
  return (
    <div
      className={classes.join(" ")}
      style={{ width, height, ...clubSlots(clubs.home, clubs.away, clubs.you ?? clubs.home) }}
      data-shot={shotId(mod, state, canvas)}
      data-canvas={canvas}
      lang={state.language ?? "en"}
    >
      <LabelsProvider language={state.language ?? "en"}>
        <div className="lab-stage" style={state.width ? { width: state.width } : undefined}>
          <Boundary>{state.render(canvas)}</Boundary>
        </div>
      </LabelsProvider>
      {guides && canvas === "video" && <div className="lab-safe" />}
    </div>
  );
}

export function Lab() {
  const params = new URLSearchParams(location.search);
  const guides = params.get("guides") === "1";

  const shot = params.get("shot");
  if (shot) {
    for (const mod of modules)
      for (const state of mod.states)
        for (const canvas of canvasesOf(state))
          if (shotId(mod, state, canvas) === shot)
            return <Frame mod={mod} state={state} canvas={canvas} guides={guides} forShot />;
    return <div className="lab-error">No shot named {shot}</div>;
  }

  const only = params.get("c");
  const shown = only ? modules.filter((m) => m.component === only) : modules;
  const link = (c?: string) => {
    const p = new URLSearchParams(params);
    if (c) p.set("c", c);
    else p.delete("c");
    return `?${p}`;
  };
  const toggleGuides = () => {
    const p = new URLSearchParams(params);
    if (guides) p.delete("guides");
    else p.set("guides", "1");
    location.search = `?${p}`;
  };

  return (
    <div className="lab">
      <nav className="lab-nav">
        <h1>Component lab</h1>
        <a href={link()} aria-current={only ? undefined : "page"}>
          All ({shots.length} shots)
        </a>
        {modules.map((m) => (
          <a key={m.component} href={link(m.component)} aria-current={only === m.component ? "page" : undefined}>
            {m.component} <span className="lab-empty">· {m.states.length}</span>
          </a>
        ))}
        <label>
          <input type="checkbox" checked={guides} onChange={toggleGuides} /> Safe-area guides
        </label>
      </nav>
      <main className="lab-main">
        {shown.length === 0 && <p className="lab-empty">No components yet. Add a src/ui/**/Name.lab.tsx.</p>}
        {shown.map((mod) => (
          <section key={mod.component}>
            <h2>{mod.component}</h2>
            <p className="lab-summary">{mod.summary}</p>
            {mod.states.map((state) => (
              <div className="lab-state" key={state.name}>
                <h3>
                  {state.name} <code>{canvasesOf(state).join(" · ")}</code>
                </h3>
                <p>{state.note}</p>
                <div className="lab-row">
                  {canvasesOf(state).map((canvas) => (
                    <div key={canvas} className={`lab-scaled-${canvas}`}>
                      <Frame mod={mod} state={state} canvas={canvas} guides={guides} />
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </section>
        ))}
      </main>
    </div>
  );
}
