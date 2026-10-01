import { C } from "~/helpers/constants.ts";
import type { InsertSetting } from "~/server/db/schema/settings.ts";

export const defaultGlobalSettings: InsertSetting[] = [
  {
    key: "error-logs-contact-email",
    group: "default",
    value: "",
    description: "Contact email address to send error logs to",
  },
  {
    key: "kofi-goal",
    group: "default",
    value: "",
    description:
      "The next goal on the RecordRanks Ko-fi page, i.e. the RR feature that will be prioritized once the funding goal is reached.",
  },
  {
    key: "kofi-goal-progress",
    group: "default",
    value: "",
    description:
      "The progress towards the next goal on the RecordRanks Ko-fi page, as a percentage. Leave empty to disable. Value: (number).",
  },

  // page-contents
  {
    key: "privacy-policy",
    group: "page-contents",
    value: "",
    description: "The contents of the privacy policy page. Leave empty to disable. Markdown is supported.",
  },
  {
    key: "public-exports-readme",
    group: "page-contents",
    value: `# ${process.env.NEXT_PUBLIC_PROJECT_NAME} Database Export Readme

- Export format version: ${C.publicExportsFormatVersions.at(-1)}
- Website: ${process.env.NEXT_PUBLIC_BASE_URL}

This is a database export for ${process.env.NEXT_PUBLIC_PROJECT_NAME}. When opening one of the CSV files, make sure to set , (comma) as the separator and " (double quote) as the string delimiter.

## License

The results in these exports are available under the [CC Attribution-ShareAlike 4.0 International](https://creativecommons.org/licenses/by-sa/4.0/) license.

## Using the export files

The CSV files can be used directly for putting together various statistics based on the data. They can also be imported using Supabase (e.g. for testing the website using real data in local development). The process for that is outlined in the [RecordRanks](${C.sourceCodeLink}) README.

Note that, due to limitations with the CSV format, empty string values are represented as \`__EMPTY_STRING__\` (e.g. in the \`contests.description\` column). You can (and should) safely change those values to empty strings.

## Attempt results

The results are stored in a format based on the WCA format. See the [WCA exports page](https://www.worldcubeassociation.org/export/results) for the details. The differences are outlined below.

Results for events of the "time" type use the max time value (${C.maxTime}) for unknown time. This is used for Extreme BLD results, where the mere evidence of a successful attempt is an achievement in and of itself. This can only be set by an admin.

Results for events of the "multi" type are based on the WCA multi format. The difference is that these exports omit the leading 0/1 character (all results are based on the new format), allow multi results up to 9999 cubes instead of 99, time is stored as centiseconds instead of seconds, and DNFs are stored with all of the same information (e.g. "DNF (5/12 52:13)"), just as negative numbers. So the full format is as follows:

\`\`\`
(-)DDDDTTTTTTTMMMM

isDnf              = the result is a negative value (all DNFs are treated as tied)
difference         = 9999 - |DDDD| (the latter is the absolute value of solved - missed, to accommodate DNFs)
timeInCentiseconds = TTTTTTT (${C.maxTime} means unknown time and is the maximum time value)
missed             = MMMM
solved             = difference + missed
attempted          = solved + missed
\`\`\`
`,
    description:
      "This README is displayed on the public exports page and included as a file in the export archives. Markdown is supported.",
  },

  // features
  {
    key: "public-exports-to-keep",
    group: "features",
    value: "0",
    description: "The number of exports to keep for automated public exports. Value: (integer).",
  },
  {
    key: "collective-cubing-enabled",
    group: "features",
    value: "false",
    description:
      "Whether or not to enable Collective Cubing - the minigame where people solve a 2x2x2 Rubik's Cube one move at a time on the home page. Value: true|false.",
  },
  {
    key: "scorecards-service-link",
    group: "features",
    value: "",
    description: "Link to self-hosted scorecards generator service (see README for more details)",
  },
];

export function getDefaultOrgSettings(organizationId: string): InsertSetting[] {
  return [
    {
      key: "space-type" as const,
      group: "default" as const,
      value: "default",
      description: "The type of the space affects some features. Value: default|speedcubing.",
    },
    {
      key: "video-based-results-contact-email" as const,
      group: "default" as const,
      value: "",
      description: "Contact email address to send notifications about video-based results to",
    },

    // page-contents
    {
      key: "home-page-description" as const,
      group: "page-contents" as const,
      value: "",
      description: "Description of the project for the home page. Markdown is supported.",
    },
    {
      key: "about-page-content" as const,
      group: "page-contents" as const,
      value: "",
      description: "Page content for the about page. Markdown is supported.",
    },
    {
      key: "rules-page-content" as const,
      group: "page-contents" as const,
      value: "",
      description: "Page content for the rules page. Markdown is supported.",
    },
    {
      key: "moderator-instructions-page-content" as const,
      group: "page-contents" as const,
      value: "",
      description: "Page content for the moderator instructions page. Leave empty to disable. Markdown is supported.",
    },
    {
      key: "moderator-instructions-description" as const,
      group: "page-contents" as const,
      value: "",
      description:
        "Description for the moderator instructions for the section on the home page. Markdown is supported.",
    },
    {
      key: "video-based-results-rules" as const,
      group: "page-contents" as const,
      value: "",
      description:
        "Rules shown at the top of the submit video-based result page. Optionally use this to insert the video-based-results-contact-email value: {{vbrContactEmail}}. Markdown is supported.",
    },
    {
      key: "video-based-results-instructions" as const,
      group: "page-contents" as const,
      value: `Video-based results can be submitted by any user, but there is a review process involved. Until a video-based result reviewer approves the result, it won't be included in the rankings. The review process works as follows:

1. Find the email thread for the result and check that there are no outstanding issues or questions from the author or other reviewers.
2. Click on the edit result button and open the video in a new tab.
3. Make sure the link doesn't contain any tracking parameters (e.g. \`?source=xyz\`).
4. Check that the video contains information about the competitor to verify that the correct person is selected.
5. Check that the correct event is being done in the video.
6. Check that the date is correct (the date of upload serves as evidence of when the result was achieved, which affects records).
7. Check the time and memorization time, if applicable. The time has to match exactly, but the memorization time can have a few seconds of leeway, since it doesn't affect rankings.
8. If everything is correct, submit and approve. If something is off or you would like to come back to the result later, simply submit to save your changes. You can also just close the tab without submitting.

If you see any errors, correct them before submitting. If you see anything that requires following up with the author, do not approve the result and send an email in the result submission thread. Some other things to note:

- Make sure the rules are being followed (you can find them on the result submission page).
- Don't approve your own results, let another reviewer do it.
- Bo3 and Bo5 formats are not available, since there's no point in them. Mo3 and Ao5 are used instead respectively, since in the video-based result rankings both single and average from the same result are considered.
- Reviewers can set "unknown" time using the \`U\` key when entering a result. This is used for events where simply getting a result is a significant achievement, but the video does not show the entire memorization and/or execution phase. Results like that get ranked last (for multi, points are still considered, but point ties lead to the result being ranked last). This also works on the submission page.
- Reviewers can set "video no longer available" for results that have already been verified, but the video has since been removed. This also works on the submission page.
- Once a result is approved, record results set on the same day or after are cancelled, if they are worse than the approved result. You will see this on the video-based results page after you approve the new record result. E.g. a \`1:00.41\` 4x4x4 Blindfolded ER set on 19.02.2026 cancels a \`1:01.58\` ER set on 23.02.2026.`,
      description:
        "Instructions shown at the top of the video-based results page. Only video-based result reviewers can see this. Markdown is supported.",
    },
    {
      key: "member-request-instructions" as const,
      group: "page-contents" as const,
      value:
        "Here you can send a request to the admin team to ask for a competitor profile to be tied to your account, ask for a role, or anything else.",
      description: "Instructions shown in the user request tab on the user settings page. Markdown is supported.",
    },

    // features
    {
      key: "contest-types" as const,
      group: "features" as const,
      value: "comp",
      description:
        'The list of enabled contest types (comma-separated). Values: comp|meetup|online (e.g. "comp,meetup,online").',
    },
    {
      key: "video-based-results-enabled" as const,
      group: "features" as const,
      value: "false",
      description: "Whether or not the video-based results feature is enabled. Value: true|false.",
    },
    {
      key: "scorecards-link-enabled" as const,
      group: "features" as const,
      value: "false",
      description:
        "Whether or not to display the link to the scorecards generator service on the Dashboard. Has no effect if the value of scorecards-service-link is empty. Value: true|false.",
    },

    // socials
    {
      key: "website-link" as const,
      group: "socials" as const,
      value: "",
      description: "Link to a website dedicated to the space",
    },
    {
      key: "discord-server-link" as const,
      group: "socials" as const,
      value: "",
      description: "Link to a Discord server dedicated to the space",
    },
    {
      key: "instagram-link" as const,
      group: "socials" as const,
      value: "",
      description: "Link to an Instagram profile dedicated to the space",
    },
  ].map((o) => ({ ...o, organizationId }));
}
