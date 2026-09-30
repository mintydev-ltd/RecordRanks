"use client";

import { useContext } from "react";
import { MainContext } from "~/helpers/contexts.ts";

type Props = {
  children: React.ReactNode;
  link: string | null;
  logo?: "discord" | "instagram";
} & React.HTMLAttributes<HTMLAnchorElement>;

function SocialLinkButton({ children, link, logo, className }: Props) {
  const { theme } = useContext(MainContext);

  if (link === null) return;

  return (
    <a
      href={link}
      target="_blank"
      rel="noreferrer"
      className={`d-inline-flex btn ${theme === "dark" ? "btn-light" : "btn-dark"} gap-2 align-items-center ${className}`}
    >
      {logo === "discord" && <span className="tw:icon-[logos--discord-icon]" />}
      {logo === "instagram" && <span className="tw:icon-[logos--instagram-icon]" />}
      <span>{children}</span>
    </a>
  );
}

export default SocialLinkButton;
