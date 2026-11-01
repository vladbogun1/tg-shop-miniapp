"use client";

import dynamic from "next/dynamic";
import "./scene-fx.css";

/** The sparks canvas (the heavy part) is a separate chunk loaded after hydration; the background itself is CSS. */
const Embers = dynamic(() => import("./SceneEmbers").then((m) => m.Embers), { ssr: false });

/** Page background ("scene"): CSS gradient + the lazily loaded sparks, see SceneEmbers. */
export function SceneFx() {
  return (
    <div className="scene" data-fx="embers" aria-hidden>
      <Embers />
    </div>
  );
}
