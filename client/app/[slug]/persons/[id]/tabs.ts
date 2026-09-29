import type { NavigationItem } from "~/helpers/types/NavigationItem.ts";
import { slugPath } from "~/helpers/utility-functions.ts";

export function getPersonsTabs(slug: string, personId: number) {
  return [
    { title: "PRs", value: "prs", route: slugPath(slug, `/persons/${personId}`) },
    { title: "Records", value: "records", route: slugPath(slug, `/persons/${personId}/records`) },
    { title: "Competitions", value: "competitions", route: slugPath(slug, `/persons/${personId}/competitions`) },
  ] as const satisfies NavigationItem[];
}
