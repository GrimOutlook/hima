import { Field, Listbox } from "@headlessui/react";
import { PoolFormErrors, fieldIsInvalid } from "./PoolFormErrors";
import React, { useState } from "react";
import {
  selectPoolFormData,
  setPoolFormData,
} from "@/lib/features/poolFormSlice";
import { useAppDispatch, useAppSelector } from "@/lib/hooks";
import { PoolFormFieldProps } from ".";
import { PoolPeriodListButton } from "./PoolPeriodListButton";
import { PoolPeriodListOptions } from "./PoolPeriodListOptions";

const FIELD = PoolFormErrors.PERIOD;

export const PoolPeriodField: React.FC<PoolFormFieldProps> = ({
  submitHasBeenClicked,
}) => {
  const dispatch = useAppDispatch();
  const poolFormData = useAppSelector(selectPoolFormData);
  const [isInvalid, setIsInvalid] = useState(false);
  const [optionsListIsFocused, setOptionsListIsFocused] = useState(false);
  const [hasBeenFocused, setHasBeenFocused] = useState(false);

  const handleChange = (period: string) => {
    setIsInvalid(fieldIsInvalid(FIELD, period));

    const data = { ...poolFormData, period };
    dispatch(setPoolFormData(data));
  };

  const showError =
    (isInvalid && (hasBeenFocused && optionsListIsFocused !== true)) ||
    (submitHasBeenClicked && fieldIsInvalid(FIELD, poolFormData.period));

  return (
    <Field className={"inline"}>
      <Listbox
        value={poolFormData.period}
        onChange={(event) => handleChange(event)}
      >
        <PoolPeriodListButton
          showError={showError}
          onBlur={() => {
            setIsInvalid(fieldIsInvalid(FIELD, poolFormData.period));
          }}
          onFocus={() => {
            setOptionsListIsFocused(false);
            setHasBeenFocused(true);
            setIsInvalid(false);
          }}
        />
        <PoolPeriodListOptions onFocus={() => setOptionsListIsFocused(true)} />
      </Listbox>
    </Field>
  );
};
