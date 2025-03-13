import { Field, Label, Listbox } from "@headlessui/react";
import {
  selectEventFormData,
  selectEventFormErrors,
  setEventFormData,
  setEventFormErrors,
} from "@/lib/features/eventFormSlice";
import { useAppDispatch, useAppSelector } from "@/lib/hooks";
import { EventFormErrors } from "./EventFormErrors";
import { EventPoolListButton } from "./EventPoolListButton";
import { EventPoolListOptions } from "./EventPoolListOptions";

const FIELD = EventFormErrors.POOL;

export const EventPoolField = () => {
  const dispatch = useAppDispatch();
  const eventFormData = useAppSelector(selectEventFormData);
  const errors = useAppSelector(selectEventFormErrors);

  const validate = (value: number) => {
    // eslint-disable-next-line init-declarations
    let newErrors;

    if (value === 0) {
      // eslint-disable-next-line no-bitwise
      newErrors = errors | FIELD;
    } else {
      // eslint-disable-next-line no-bitwise
      newErrors = errors | ~FIELD;
    }

    dispatch(setEventFormErrors(newErrors));
  };

  const handleChange = (poolId: number) => {
    validate(poolId);

    const data = { ...eventFormData, poolId };
    dispatch(setEventFormData(data));
  };

  return (
    <Field>
      <Label className={"block text-3xl"}>Pool</Label>
      <Listbox
        value={eventFormData.poolId}
        onChange={(event) => handleChange(event)}
      >
        <EventPoolListButton />
        <EventPoolListOptions />
      </Listbox>
    </Field>
  );
};
