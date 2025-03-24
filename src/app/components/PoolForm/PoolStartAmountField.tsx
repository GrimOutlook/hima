import { Field, Input, Label } from "@headlessui/react";
import { PoolFormErrors, fieldIsInvalid } from "./PoolFormErrors";
import React, { useState } from "react";
import {
  selectPoolFormData,
  setPoolFormData,
} from "@/lib/features/poolFormSlice";
import { useAppDispatch, useAppSelector } from "@/lib/hooks";
import { GradientFocusInput } from "../GradientFocusInput";
import { PoolFormFieldProps } from ".";

const FIELD = PoolFormErrors.START_AMOUNT;

export const PoolStartAmountField: React.FC<PoolFormFieldProps> = ({
  submitHasBeenClicked,
}) => {
  const dispatch = useAppDispatch();
  const poolFormData = useAppSelector(selectPoolFormData);
  const [isInvalid, setIsInvalid] = useState(false);
  const [hasBeenFocused, setHasBeenFocused] = useState(false);

  const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const num = Number(event.target.value);
    const data = { ...poolFormData, startAmount: num };
    dispatch(setPoolFormData(data));
  };

  const showError = isInvalid && (hasBeenFocused || submitHasBeenClicked);

  return (
    <Field className={"inline"}>
      <Label className={"mx-1"}>With</Label>
      <GradientFocusInput
        invalid={showError}
        className="h-10 w-20 mr-1 inline-block"
        focusClassName="bg-linear-to-tr from-sky-300 to-red-400 shadow-lg"
        unfocusedClassName="bg-zinc-300"
      >
        <Input
          name="startAmount"
          value={poolFormData.startAmount}
          onBlur={() =>
            setIsInvalid(fieldIsInvalid(FIELD, poolFormData.startAmount))
          }
          onFocus={() => {
            setHasBeenFocused(true);
            setIsInvalid(false);
          }}
          onChange={(event) => handleChange(event)}
          className={showError ? "border-red-500" : ""}
        />
      </GradientFocusInput>
      <Label>hours</Label>
    </Field>
  );
};
