import { PencilSquareIcon, TrashIcon } from "@heroicons/react/24/outline";
import { PPLEvent } from "@/lib/models/PPLEvent";
import React from "react";
import { removeEvent } from "@/lib/features/eventListSlice";
import { useAppDispatch } from "@/lib/hooks";

type EventDetailsPanelProps = {
  event: PPLEvent;
};

export const EventDetailsPanel: React.FC<EventDetailsPanelProps> = ({
  event,
}) => {
  const dispatch = useAppDispatch();

  return (
    <>
      {event.description && (
        <div
          className={`relative border-t-black/10 border-t-2 w-full text-lg flex flex-col`}
        >
          <div className="font-normal w-full text-left p-2">
            <span className="m-1 text-lg font-normal">{event.description}</span>
          </div>
        </div>
      )}
      <div
        className={`relative border-t-black/10 border-t-2 flex justify-between`}
      >
        <PencilSquareIcon
          className={`stroke-gray-700 size-7 m-1 p-0.5 rounded-full
          hover:bg-black/10 hover:cursor-pointer`}
        />
        <div></div>
        <TrashIcon
          className={`stroke-gray-700 size-7 m-1 p-0.5 rounded-full
          hover:bg-black/10 hover:cursor-pointer`}
          onClick={() => dispatch(removeEvent(event.id))}
        />
      </div>
    </>
  );
};
