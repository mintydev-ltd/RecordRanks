"use client";

import { useContext } from "react";
import { C } from "~/helpers/constants.ts";
import { MainContext } from "~/helpers/contexts.ts";

function DocsButton() {
  const { theme } = useContext(MainContext);

  return (
    <a
      href={C.rrDocsLink}
      target="_blank"
      rel="noopener"
      className={`btn btn-sm ${theme === "dark" ? "btn-light" : "btn-dark"} tw:flex! tw:items-center tw:gap-2`}
    >
      {/* biome-ignore lint/performance/noImgElement: this is necessary here */}
      <img src="/recordranks_logo.png" alt="RecordRanks Logo" className="tw:h-5" />
      Docs
    </a>
  );
}

export default DocsButton;
