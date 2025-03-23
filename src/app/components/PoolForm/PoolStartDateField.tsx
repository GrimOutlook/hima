import { Field, Input, Label } from "@headlessui/react";
import { PoolFormErrors, fieldIsValid } from "./PoolFormErrors";
import React, { useState } from "react";
import {
  selectPoolFormData,
  setPoolFormData,
} from "@/lib/features/poolFormSlice";
import { useAppDispatch, useAppSelector } from "@/lib/hooks";
import { GradientFocusInput } from "../GradientFocusInput";
import { PoolFormFieldProps } from ".";

const FIELD = PoolFormErrors.START_DATE;

export const PoolStartDateField: React.FC<PoolFormFieldProps> = ({
  submitHasBeenClicked,
}) => {
  const dispatch = useAppDispatch();
  const poolFormData = useAppSelector(selectPoolFormData);
  const [isInvalid, setIsInvalid] = useState(false);
  const [hasBeenFocused, setHasBeenFocused] = useState(false);

  const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const data = { ...poolFormData, startDate: event.target.value };
    dispatch(setPoolFormData(data));
  };

  const showError = isInvalid && (hasBeenFocused || submitHasBeenClicked);

  return (
    <Field className={"mt-2 inline"}>
      <Label className={"text-3xl block"}>Starting on</Label>
      <GradientFocusInput
        invalid={showError}
        className="h-10 w-auto mr-1 inline-block"
        focusClassName="bg-linear-to-tr from-sky-300 to-red-400 shadow-lg"
        unfocusedClassName="bg-zinc-300"
      >
        <Input
          name="startDate"
          type="date"
          value={poolFormData.startDate}
          onBlur={() =>
            setIsInvalid(!fieldIsValid(FIELD, poolFormData.startDate))
          }
          onChange={(event) => handleChange(event)}
          className={showError ? "border-red-500" : ""}
        />
      </GradientFocusInput>
    </Field>
  );
};
