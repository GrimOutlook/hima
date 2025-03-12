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
import { CheckIcon, ChevronDownIcon } from "@heroicons/react/20/solid";
import React, { useState } from "react";
import { addPool, selectNextPoolID } from "@/lib/features/poolListSlice";
import {
  setPoolFormOpenState,
  selectPoolFormOpenState,
} from "@/lib/features/poolFormSlice";
import { useAppDispatch, useAppSelector } from "@/lib/hooks";
import { GradientFocusInput } from "../GradientFocusInput";
import { OverlayDialog } from "../OverlayDialog";
import { PPLPool } from "@/lib/models/PPLPool";
import { Period } from "@/lib/models/Period";
import clsx from "clsx";
import dayjs from "dayjs";
import { serializeToPoolDto } from "@/lib/models/PPLPoolDto";
import { setTimeout } from "timers";
import { PoolNameField } from "./PoolNameField";
import { PoolDescriptionField } from "./PoolDescriptionField";
import { PoolAccrualRateField } from "./PoolAccrualRateField";
import { PoolPeriodField } from "./PoolPeriodField";
import { PoolStartDateField } from "./PoolStartDateField";
import { PoolStartAmountField } from "./PoolStartAmountField";

type PoolFormProps = {
  className?: string;
};

type PoolFormData = {
  name: string;
  description: string;
  amount: number;
  period: Period;
  startAmount: number;
  startDate: string;
};

const initialPoolFormData: PoolFormData = {
  amount: 0,
  description: "",
  name: "",
  period: Period.BiWeekly,
  startAmount: 0,
  startDate: "",
};

const createPool = (
  poolFormData: PoolFormData,
  nextPoolID: number,
  errors: number
) => {
  if (errors > 0) {
    return;
  }

  const pool: PPLPool = {
    amount: poolFormData.amount!,
    description: poolFormData.description || "",
    id: nextPoolID,
    name: poolFormData.name!,
    period: poolFormData.period!,
    startAmount: poolFormData.startAmount!,
    startDate: dayjs(poolFormData.startDate!),
  };

  dispatch(addPool(serializeToPoolDto(pool)));
  setPoolFormData(initialPoolFormData);
  dispatch(setPoolFormOpenState(false));
};

const PoolForm: React.FC<PoolFormProps> = ({ className }) => {
  const dispatch = useAppDispatch();
  const poolFormOpenState = useAppSelector(selectPoolFormOpenState);
  const [poolFormData, setPoolFormData] = useState(initialPoolFormData);
  const [errors, setErrors] = useState<number>(0);
  const nextPoolID = useAppSelector(selectNextPoolID);

  const handleChange = (target: string, value: string) => {
    setPoolFormData({
      ...poolFormData,
      [target]: value,
    });
  };

  return (
    <OverlayDialog
      onClose={() => dispatch(setPoolFormOpenState(false))}
      show={poolFormOpenState}
    >
      <div className={`${className} bg-zinc-300 h-fit w-fit rounded-lg`}>
        <form>
          <Fieldset className={"p-6"}>
            <Legend className={"text-6xl"}>New PPL Pool</Legend>
            <PoolNameField />
            <PoolDescriptionField />
            <PoolAccrualRateField />
            <PoolPeriodField />
            <PoolStartDateField />
            <PoolStartAmountField />
            <Field className={"mt-4"}>
              <Button
                className={
                  "w-full rounded-lg p-2 text-3xl bg-black/10 text-zinc-700 hover:cursor-pointer hover:shadow-lg transition duration-150 ease-in-out hover:scale-102"
                }
                onClick={() => createPool()}
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

export default PoolForm;
