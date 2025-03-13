import { Field, Input, Label } from "@headlessui/react";
import {
  selectPoolFormData,
  selectPoolFormErrors,
  setPoolFormData,
  setPoolFormErrors,
} from "@/lib/features/poolFormSlice";
import { useAppDispatch, useAppSelector } from "@/lib/hooks";
import { GradientFocusInput } from "../GradientFocusInput";
import { PoolFormErrors } from "./PoolFormErrors";
import React from "react";

// eslint-disable-next-line max-lines-per-function
export const PoolStartAmountField = () => {
  const dispatch = useAppDispatch();
  const poolFormData = useAppSelector(selectPoolFormData);
  const errors = useAppSelector(selectPoolFormErrors);

  const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const num = Number(event.target.value);
    const data = { ...poolFormData, startAmount: num };
    dispatch(setPoolFormData(data));
  };

  const validate = () => {
    // eslint-disable-next-line init-declarations
    let newErrors;

    if (poolFormData.startAmount === 0) {
      // eslint-disable-next-line no-bitwise
      newErrors = errors | PoolFormErrors.START_AMOUNT;
    } else {
      // eslint-disable-next-line no-bitwise
      newErrors = errors | ~PoolFormErrors.START_AMOUNT;
    }

    dispatch(setPoolFormErrors(newErrors));
  };

  // eslint-disable-next-line no-bitwise
  const isInvalid = (errors & PoolFormErrors.START_AMOUNT) > 0;

  return (
    <Field>
      <Label className={"mx-1"}>With</Label>
      <GradientFocusInput
        invalid={isInvalid}
        className="h-10 w-20 mr-1 inline-block"
        focusClassName="bg-linear-to-tr from-sky-300 to-red-400 shadow-lg"
        unfocusedClassName="bg-zinc-300"
      >
        <Input
          name="startAmount"
          value={poolFormData.startAmount}
          onBlur={() => validate()}
          onClick={() =>
            // eslint-disable-next-line no-bitwise
            dispatch(setPoolFormErrors(errors & ~PoolFormErrors.START_AMOUNT))
          }
          onChange={(event) => handleChange(event)}
          className={isInvalid ? "border-red-500" : ""}
        />
      </GradientFocusInput>
      <Label>hours</Label>
    </Field>
  );
};
