"use client";

import {
  Button,
  Field,
  Fieldset,
  Input,
  Label,
  Legend,
  Listbox,
  ListboxButton,
  ListboxOption,
  ListboxOptions,
  Textarea,
} from "@headlessui/react";
import React, { useState } from "react";
import { CheckIcon, ChevronDownIcon } from "@heroicons/react/20/solid";
import clsx from "clsx";

import { useAppDispatch, useAppSelector } from "@/lib/hooks";
import {
  closeEventDialog,
  selectEventDialogOpenState,
} from "@/lib/features/eventDialogSlice";
import { addEvent } from "@/lib/features/eventListSlice";
import { PPLEvent } from "@/lib/models/PPLEvent";
import { SerializeToEventDto } from "@/lib/models/PPLEventDto";
import { selectNextEventID } from "@/lib/features/eventListSlice";
import dayjs from "dayjs";
import { OverlayDialog } from "./OverlayDialog";
import { deserializeToPool } from "@/lib/models/PPLPool";
import { selectPools } from "@/lib/features/poolListSlice";
import { GradientFocusInput } from "./GradientFocusInput";

type EventFormData = {
  title: string;
  amount: number;
  description: string;
  date: string;
  pool: number | null;
};

const initialEventFormData: EventFormData = {
  amount: 0,
  date: new Date().toDateString(),
  description: "",
  pool: null,
  title: "",
};

const EventForm: React.FC = () => {
  const dispatch = useAppDispatch();
  const eventDialogOpenState = useAppSelector(selectEventDialogOpenState);
  const pools = useAppSelector(selectPools).map((pool) =>
    deserializeToPool(pool)
  );
  const [eventFormData, setEventFormData] = useState(initialEventFormData);
  const nextEventID = useAppSelector(selectNextEventID);

  const handleChange = (target: string, value: string | number) => {
    setEventFormData({
      ...eventFormData,
      [target]: value,
    });
  };

  const selectedPoolName = () => {
    if (pools.length <= 0) {
      return null;
    }
    const pool = pools.find((pool) => pool.id === eventFormData.pool);
    if (pool === null) {
      return null;
    }
    return pool.name;
  };

  return (
    <OverlayDialog
      onClose={() => dispatch(closeEventDialog())}
      show={eventDialogOpenState}
    >
      <div className="bg-zinc-300 h-fit w-fit rounded-lg">
        <form>
          <Fieldset className={"p-6"}>
            <Legend className={"text-6xl"}>New PPL Event</Legend>
            <div className="w-full mt-4 flex">
              <Field className={"mr-4"}>
                <Label className={"block text-3xl"}>Title</Label>
                <GradientFocusInput
                  className="w-60 h-10"
                  focusClassName="bg-linear-to-tr from-sky-300 to-red-400 shadow-lg"
                  unfocusedClassName="bg-zinc-300"
                >
                  <Input
                    autoFocus
                    name="title"
                    value={eventFormData.title}
                    onChange={(e) =>
                      handleChange(e.target.name, e.target.value)
                    }
                  />
                </GradientFocusInput>
              </Field>
              <Field>
                <Label className={"block text-3xl"}>Hours</Label>
                <GradientFocusInput
                  className="w-20 h-10 mr-1"
                  focusClassName="bg-linear-to-tr from-sky-300 to-red-400 shadow-lg"
                  unfocusedClassName="bg-zinc-300"
                >
                  <Input
                    name="amount"
                    value={eventFormData.amount}
                    onChange={(e) =>
                      handleChange(e.target.name, e.target.value)
                    }
                  />
                </GradientFocusInput>
              </Field>
            </div>
            <Field className={"mt-2"}>
              <Label className={"block text-3xl"}>Description</Label>
              <GradientFocusInput
                className="w-80 h-20"
                focusClassName="bg-linear-to-tr from-sky-300 to-red-400 shadow-lg"
                unfocusedClassName="bg-zinc-300"
              >
                <Textarea
                  name={"description"}
                  value={eventFormData.description}
                  onChange={(e) => handleChange(e.target.name, e.target.value)}
                />
              </GradientFocusInput>
            </Field>
            <div className="mt-2 flex">
              <Field className="mr-4">
                <Label className={"text-3xl block"}>Date Taken</Label>
                <GradientFocusInput
                  className="w-40 h-10"
                  focusClassName="bg-linear-to-tr from-sky-300 to-red-400 shadow-lg"
                  unfocusedClassName="bg-zinc-300"
                >
                  <Input
                    type="date"
                    value={eventFormData.date}
                    onChange={(e) =>
                      handleChange(e.target.name, e.target.value)
                    }
                  />
                </GradientFocusInput>
              </Field>
              <Field>
                <Label className={"block text-3xl"}>Pool</Label>
                <Listbox
                  value={eventFormData.pool}
                  onChange={(e) => handleChange("pool", e)}
                >
                  <ListboxButton
                    className={
                      "relative h-10 w-40 p-2 pr-10 rounded-lg bg-black/10"
                    }
                  >
                    {selectedPoolName()}
                    <ChevronDownIcon
                      className="group pointer-events-none absolute top-2.5 right-2.5 size-4 fill-black/60"
                      aria-hidden="true"
                    />
                  </ListboxButton>
                  <ListboxOptions
                    anchor="bottom"
                    className={clsx(
                      "w-[var(--button-width)] rounded-xl border border-black/10 bg-zinc-300/95 p-1 [--anchor-gap:var(--spacing-1)] focus:outline-hidden transition duration-100 ease-in data-leave:data-closed:opacity-0"
                    )}
                  >
                    {pools.map((pool) => (
                      <ListboxOption
                        key={pool.id}
                        value={pool.id}
                        className="group flex cursor-default items-center gap-2 rounded-lg py-1.5 px-3 select-none data-focus:bg-white/10"
                      >
                        <CheckIcon className="invisible size-4 fill-black group-data-selected:visible" />
                        {pool.name}
                      </ListboxOption>
                    ))}
                  </ListboxOptions>
                </Listbox>
              </Field>
            </div>
            <Field className={"mt-4"}>
              <Button
                className={
                  "w-full rounded-lg p-2 text-3xl bg-black/10 text-zinc-700 hover:cursor-pointer hover:shadow-lg transition duration-150 ease-in-out hover:scale-102"
                }
                onClick={() => {
                  if (eventFormData.pool == undefined) {
                    return;
                  }

                  const even: PPLEvent = {
                    id: nextEventID,
                    title: eventFormData.title,
                    description: eventFormData.description,
                    hours: eventFormData.amount,
                    date: dayjs(eventFormData.date),
                    poolId: eventFormData.pool!,
                  };
                  dispatch(addEvent(SerializeToEventDto(even)));
                  setEventFormData(initialEventFormData);
                  dispatch(closeEventDialog());
                }}
              >
                Create
              </Button>
            </Field>
          </Fieldset>
        </form>
      </div>
    </OverlayDialog>
  );
};

export default EventForm;
