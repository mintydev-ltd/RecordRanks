"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useQueryState } from "nuqs";
import { useMemo, useState } from "react";
import EventIcon from "~/app/components/EventIcon.tsx";
import type { EventCategoryResponse } from "~/server/db/schema/event-categories.ts";
import type { EventResponse } from "~/server/db/schema/events.ts";

type Props = {
  events: Pick<EventResponse, "eventId" | "name" | "categoryId" | "hidden">[];
  eventCategories: EventCategoryResponse[];
  eventIdOverride?: string;
  pathTemplate?: string; // should include __EVENT_ID__ that gets replaced by the new value
  showAllEvents?: boolean;
  resetOnSameEventClick?: boolean;
};

function EventButtons({
  events,
  eventCategories,
  eventIdOverride,
  pathTemplate,
  showAllEvents,
  resetOnSameEventClick,
}: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [eventId, setEventId] = useQueryState("eventId", { shallow: false });

  const filteredCategories = eventCategories.filter(
    (ec) => !ec.hidden && events.some((e) => e.categoryId === ec.id && !e.hidden),
  );
  const currEventId = eventIdOverride ?? eventId;
  const currEvent = events.find((e) => e.eventId === currEventId);

  const [selectedCat, setSelectedCat] = useState<EventCategoryResponse>(
    filteredCategories.find((ec) => ec.id === currEvent?.categoryId) ?? filteredCategories[0],
  );

  const filteredEvents = useMemo(
    () => (showAllEvents ? events : events.filter((e) => !e.hidden && e.categoryId === selectedCat.id)),
    [events, selectedCat, showAllEvents],
  );

  const handleEventClick = (newEventId: string) => {
    if (pathTemplate) {
      const urlSearchParams = new URLSearchParams(searchParams);
      router.push(`${pathTemplate.replace("__EVENT_ID__", newEventId)}?${urlSearchParams}`);
    } else if (newEventId !== currEventId) {
      setEventId(newEventId);
    } else if (resetOnSameEventClick) {
      setEventId(null);
    }
  };

  return (
    <div>
      {/* Event categories */}
      {!showAllEvents && filteredCategories.length > 1 && (
        <>
          {/* biome-ignore lint/a11y/useSemanticElements: this is the most suitable way to make a button group */}
          <div className="btn-group btn-group-sm my-2 tw:flex-wrap" role="group">
            {filteredCategories.map((cat) => (
              <button
                key={cat.id}
                type="button"
                className={`btn btn-primary ${cat === selectedCat ? "active" : ""}`}
                onClick={() => setSelectedCat(cat)}
              >
                <span className="d-none d-md-inline">{cat.name}</span>
                <span className="d-inline d-md-none">{cat.shortName || cat.name}</span>
              </button>
            ))}
          </div>

          {selectedCat?.description && <p className="mb-2">{selectedCat.description}</p>}
        </>
      )}

      {/* Events */}
      {(filteredEvents.length > 1 || filteredCategories.length > 1) && (
        <div className="d-flex fs-3 mb-3 flex-wrap">
          {filteredEvents.map((event) => (
            <EventIcon
              key={event.eventId}
              event={event}
              onClick={() => handleEventClick(event.eventId)}
              isActive={event.eventId === currEventId}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export default EventButtons;
