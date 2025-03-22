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

const FIELD = PoolFormErrors.NAME;

export const PoolNameField: React.FC<PoolFormFieldProps> = ({
  submitHasBeenClicked,
}) => {
  const dispatch = useAppDispatch();
  const poolFormData = useAppSelector(selectPoolFormData);
  const [isInvalid, setIsInvalid] = useState(false);
  const [hasBeenFocused, setHasBeenFocused] = useState(false);

  const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const data = { ...poolFormData, name: event.target.value };
    dispatch(setPoolFormData(data));
  };

  const showError = isInvalid && (hasBeenFocused || submitHasBeenClicked);

  return (
    <Field>
      <Label className={"block text-3xl"}>Pool Name</Label>
      <GradientFocusInput
        invalid={showError}
        className="h-10 w-60"
        focusClassName="bg-linear-to-tr from-sky-300 to-red-400 shadow-lg"
        unfocusedClassName="bg-zinc-300"
      >
        <Input
          autoFocus
          name="name"
          value={poolFormData.name}
          onBlur={() => setIsInvalid(!fieldIsValid(FIELD, poolFormData.name))}
          onChange={(event) => handleChange(event)}
          onFocus={() => {
            setHasBeenFocused(true);
            setIsInvalid(false);
          }}
          className={showError ? "border-red-500" : ""}
        />
      </GradientFocusInput>
    </Field>
  );
};
