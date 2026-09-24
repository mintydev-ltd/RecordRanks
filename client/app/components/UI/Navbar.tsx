"use client";

import {
  faBars,
  faBook,
  faCalendarDays,
  faRankingStar,
  faScrewdriverWrench,
  faStar,
  faUser,
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useContext, useState } from "react";
import useSWR, { useSWRConfig } from "swr";
import { authClient } from "~/helpers/auth-client.ts";
import { C, IS_CUBING_CONTESTS_INSTANCE, IS_RR_INSTANCE } from "~/helpers/constants.ts";
import { MainContext } from "~/helpers/contexts.ts";
import { useFeaturesInfo, useSession } from "~/helpers/hooks.ts";
import { SwrKey } from "~/helpers/swr-keys.ts";
import { clientGetHasPermission, getHasRole, slugPath } from "~/helpers/utility-functions.ts";

function Navbar() {
  const pathname = usePathname();
  const router = useRouter();
  const { session, user, member, organization } = useSession();
  const { mutate } = useSWRConfig();
  const {
    aboutPageEnabled,
    rulesPageEnabled,
    modInstructionsPageEnabled,
    videoBasedResultsEnabled,
    publicExportsEnabled,
  } = useFeaturesInfo();
  const { changeErrorMessages, resetMessages } = useContext(MainContext);

  const { data: canAccessModDashboard } = useSWR(
    session?.activeOrganizationId ? [SwrKey.CanAccessModDashboard, session] : null,
    () => clientGetHasPermission({ modDashboard: ["view"] }),
  );
  const { data: canApproveVideoBasedResults } = useSWR(
    session?.activeOrganizationId ? [SwrKey.CanApproveVideoBasedResults, session] : null,
    () => clientGetHasPermission({ videoBasedResults: ["approve"] }),
  );
  const [expanded, setExpanded] = useState(false);
  const [resultsExpanded, setResultsExpanded] = useState(false);
  const [moreExpanded, setMoreExpanded] = useState(false);
  const [userExpanded, setUserExpanded] = useState(false);

  const isAdmin = getHasRole("admin", member?.role) || getHasRole("owner", member?.role);

  const logOut = async () => {
    resetMessages();
    collapseAll();
    await authClient.signOut();

    // Clear the SWR cache
    mutate(
      () => true, // update all keys
      undefined, // set cache data to undefined
      { revalidate: false },
    );
    router.push("/login");
  };

  const exitOrganization = async () => {
    resetMessages();
    collapseAll();
    const { error } = await authClient.organization.setActive({ organizationId: null });

    if (error) {
      changeErrorMessages([error.message ?? error.statusText]);
    } else {
      // Clear the SWR cache
      mutate(
        () => true, // update all keys
        undefined, // set cache data to undefined
        { revalidate: false },
      );
      router.push("/");
    }
  };

  const toggleDropdown = (dropdown: "results" | "more" | "user", newValue: boolean) => {
    if (dropdown === "results") {
      setResultsExpanded(newValue);
      setMoreExpanded(false);
      setUserExpanded(false);
    } else if (dropdown === "more") {
      setResultsExpanded(false);
      setMoreExpanded(newValue);
      setUserExpanded(false);
    } else {
      setResultsExpanded(false);
      setMoreExpanded(false);
      setUserExpanded(newValue);
    }
  };

  const collapseAll = () => {
    setExpanded(false);
    setResultsExpanded(false);
    setUserExpanded(false);
  };

  return (
    <nav className="navbar navbar-expand-lg bg-body-tertiary">
      <div className="container-md position-relative">
        {organization ? (
          <Link href={slugPath(organization.slug, "") || "/"} className="navbar-brand">
            {organization.logo ? <img src={organization.logo} alt="Home" className="tw:h-12" /> : "Home"}
          </Link>
        ) : (
          IS_RR_INSTANCE && (
            <Link href="/" className="navbar-brand">
              <Image src="/recordranks_logo.png" height={48} width={48} alt="RecordRanks logo" />
            </Link>
          )
        )}
        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          className="rr-icon-button d-lg-none"
          title="Menu"
          aria-label="Menu"
        >
          <FontAwesomeIcon icon={faBars} />
        </button>
        <div className={`navbar-collapse justify-content-end ${expanded ? "" : "collapse"}`}>
          <ul className="navbar-nav fs-5 mx-2 mt-3 mt-lg-0 gap-lg-2 align-items-lg-end align-items-start">
            {organization && (
              <>
                <li className="nav-item">
                  <Link
                    href={slugPath(organization.slug, "/competitions")}
                    onClick={collapseAll}
                    prefetch={false}
                    className={`nav-link ${pathname === slugPath(organization.slug, "/competitions") ? "active" : ""}`}
                  >
                    <FontAwesomeIcon icon={faCalendarDays} size="xs" className="me-2" />
                    Competitions
                  </Link>
                </li>
                <li
                  onMouseEnter={() => toggleDropdown("results", true)}
                  onMouseLeave={() => toggleDropdown("results", false)}
                  className="nav-item dropdown"
                >
                  <button
                    type="button"
                    onClick={() => toggleDropdown("results", !resultsExpanded)}
                    className={`nav-link dropdown-toggle ${new RegExp(`^${slugPath(organization.slug, "")}/(rankings/|records/|export)`).test(pathname) ? "active" : ""}`}
                  >
                    <FontAwesomeIcon icon={faRankingStar} size="xs" className="me-2" />
                    Results
                  </button>
                  <ul className={`dropdown-menu px-3 px-lg-2 py-0 ${resultsExpanded ? "show" : ""}`}>
                    <li>
                      <Link
                        href={slugPath(organization.slug, "/records")}
                        onClick={collapseAll}
                        prefetch={false}
                        className={`nav-link ${new RegExp(`^${slugPath(organization.slug, "/records")}/`).test(pathname) ? "active" : ""}`}
                      >
                        Records
                      </Link>
                    </li>
                    <li>
                      <Link
                        href={slugPath(organization.slug, "/rankings")}
                        onClick={collapseAll}
                        prefetch={false}
                        className={`nav-link ${new RegExp(`^${slugPath(organization.slug, "/rankings")}/`).test(pathname) ? "active" : ""}`}
                      >
                        Rankings
                      </Link>
                    </li>
                    <li>
                      <Link
                        href={slugPath(organization.slug, "/persons")}
                        onClick={collapseAll}
                        className={`nav-link ${pathname === slugPath(organization.slug, "/persons") ? "active" : ""}`}
                      >
                        Persons
                      </Link>
                    </li>
                    {publicExportsEnabled && (
                      <li>
                        <Link
                          href={slugPath(organization.slug, "/export")}
                          onClick={collapseAll}
                          prefetch={false}
                          className={`nav-link ${pathname === slugPath(organization.slug, "/export") ? "active" : ""}`}
                        >
                          Exports
                        </Link>
                      </li>
                    )}
                  </ul>
                </li>
                {rulesPageEnabled && (
                  <li className="nav-item">
                    <Link
                      href={slugPath(organization.slug, "/rules")}
                      onClick={collapseAll}
                      prefetch={false}
                      className={`nav-link ${pathname === slugPath(organization.slug, "/rules") ? "active" : ""}`}
                    >
                      <FontAwesomeIcon icon={faBook} size="xs" className="me-2" />
                      Rules
                    </Link>
                  </li>
                )}
                <li
                  onMouseEnter={() => toggleDropdown("more", true)}
                  onMouseLeave={() => toggleDropdown("more", false)}
                  className="nav-item dropdown"
                >
                  <button
                    type="button"
                    onClick={() => toggleDropdown("more", !moreExpanded)}
                    className="nav-link dropdown-toggle"
                  >
                    <FontAwesomeIcon icon={faStar} size="xs" className="me-2" />
                    More
                  </button>
                  <ul className={`dropdown-menu px-3 px-lg-2 py-0 ${moreExpanded ? "show" : ""}`}>
                    {aboutPageEnabled && (
                      <li>
                        <Link
                          href={slugPath(organization.slug, "/about")}
                          onClick={collapseAll}
                          prefetch={false}
                          className={`nav-link ${pathname === slugPath(organization.slug, "/about") ? "active" : ""}`}
                        >
                          About
                        </Link>
                      </li>
                    )}
                    <li>
                      <Link
                        href={slugPath(organization.slug, "/blog")}
                        onClick={collapseAll}
                        prefetch={false}
                        className={`nav-link ${new RegExp(`^${slugPath(organization.slug, "/blog")}`).test(pathname) ? "active" : ""}`}
                      >
                        Blog
                      </Link>
                    </li>
                    {modInstructionsPageEnabled && (
                      <li>
                        <Link
                          href={slugPath(organization.slug, "/moderator-instructions")}
                          onClick={collapseAll}
                          prefetch={false}
                          className={`nav-link ${pathname === slugPath(organization.slug, "/moderator-instructions") ? "active" : ""}`}
                        >
                          Moderator instructions
                        </Link>
                      </li>
                    )}
                    <li>
                      <a href={C.rrDocsLink} target="_blank" rel="noopener" onClick={collapseAll} className="nav-link">
                        Documentation
                      </a>
                    </li>
                    {organization.metadata.showDonationLinks && (
                      <li>
                        <a
                          href={C.rrDonationLink}
                          target="_blank"
                          rel="noopener"
                          onClick={collapseAll}
                          className="nav-link"
                        >
                          Support RecordRanks
                        </a>
                      </li>
                    )}
                  </ul>
                </li>
                {user && organization && canAccessModDashboard && (
                  <li className="nav-item">
                    <Link
                      href={slugPath(
                        organization.slug,
                        `/mod${isAdmin && IS_CUBING_CONTESTS_INSTANCE ? "?state=pending" : ""}`,
                      )}
                      onClick={collapseAll}
                      prefetch={false}
                      className={`nav-link ${pathname === slugPath(organization.slug, "/mod") ? "active" : ""}`}
                    >
                      <FontAwesomeIcon icon={faScrewdriverWrench} size="xs" className="me-2" />
                      Dashboard
                    </Link>
                  </li>
                )}
              </>
            )}
            {!user ? (
              <li className="nav-item">
                <Link href="/login" prefetch={false} onClick={collapseAll} className="nav-link">
                  <FontAwesomeIcon icon={faUser} size="xs" className="me-2" />
                  Log In
                </Link>
              </li>
            ) : (
              <li
                onMouseEnter={() => toggleDropdown("user", true)}
                onMouseLeave={() => toggleDropdown("user", false)}
                className="nav-item dropdown"
              >
                <button
                  type="button"
                  onClick={() => toggleDropdown("user", !userExpanded)}
                  className="nav-link dropdown-toggle text-truncate"
                >
                  <FontAwesomeIcon icon={faUser} aria-label="User" />
                </button>
                <ul className={`dropdown-menu end-0 tw:text-nowrap px-3 px-lg-2 py-0 ${userExpanded ? "show" : ""}`}>
                  {organization && member?.personId && (
                    <li>
                      <Link
                        href={slugPath(organization.slug, `/persons/${member.personId}`)}
                        prefetch={false}
                        onClick={collapseAll}
                        className={`nav-link ${pathname === slugPath(organization.slug, `/persons/${member.personId}`) ? "active" : ""}`}
                      >
                        Profile
                      </Link>
                    </li>
                  )}
                  {organization && videoBasedResultsEnabled && (
                    <>
                      {canApproveVideoBasedResults && (
                        <li>
                          <Link
                            href={slugPath(organization.slug, "/video-based-results")}
                            prefetch={false}
                            onClick={collapseAll}
                            className={`nav-link ${pathname === slugPath(organization.slug, "/video-based-results") ? "active" : ""}`}
                          >
                            Video-based results
                          </Link>
                        </li>
                      )}
                      <li>
                        <Link
                          href={slugPath(organization.slug, "/video-based-results/submit")}
                          prefetch={false}
                          onClick={collapseAll}
                          className={`nav-link ${pathname === slugPath(organization.slug, "/video-based-results/submit") ? "active" : ""}`}
                        >
                          Submit results
                        </Link>
                      </li>
                    </>
                  )}
                  {IS_RR_INSTANCE && (
                    <li>
                      <a href="https://recordranks.com/contact" target="_blank" rel="noopener" className="nav-link">
                        Contact support
                      </a>
                    </li>
                  )}
                  <li>
                    <Link
                      href="/user/settings"
                      prefetch={false}
                      onClick={collapseAll}
                      className={`nav-link ${pathname === "/user/settings" ? "active" : ""}`}
                    >
                      Settings
                    </Link>
                  </li>
                  {process.env.NEXT_PUBLIC_MULTITENANCY_ENABLED === "true" && (
                    <li>
                      <button type="button" onClick={exitOrganization} className="nav-link">
                        Switch space
                      </button>
                    </li>
                  )}
                  <li>
                    <button type="button" onClick={logOut} className="nav-link">
                      Log out
                    </button>
                  </li>
                </ul>
              </li>
            )}
          </ul>
        </div>
      </div>
    </nav>
  );
}

export default Navbar;
