'use client'

import { Button, Field, Fieldset, Input, Label, Legend, Listbox, ListboxButton, ListboxOption, ListboxOptions, Textarea } from "@headlessui/react";
import { ChangeEvent, useState } from "react";
import { CheckIcon, ChevronDownIcon } from '@heroicons/react/20/solid'
import clsx from 'clsx'

import { EnumToArray, ToTitleCase } from "@/lib/helpers"
import { useAppDispatch, useAppSelector } from "@/lib/hooks";
import { closePoolDialog, selectPoolDialogOpenState } from "@/lib/features/poolDialogSlice";
import { addPool } from "@/lib/features/poolListSlice";
import { Period } from "@/lib/models/Period";
import { PPLPool } from '@/lib/models/PPLPool';
import { SerializeToPoolDto } from "@/lib/models/PPLPoolDto";
import { selectNextPoolID } from '@/lib/features/poolListSlice';
import dayjs from "dayjs";
import { OverlayDialog } from "./overlay_dialog";
import { GradientFocusInput } from "./gradient_focus_input";

enum PoolFormErrors {
    NAME = 1,
    AMOUNT = 2,
    PERIOD = 4,
    START_DATE = 8,
    START_AMOUNT = 16
}

type PoolFormProps = {
    className?: string;
}

type PoolFormData = {
    name?: string,
    description?: string, // Not required
    amount?: number,
    period?: Period,
    startDate?: string,
    startAmount?: number,
}

const periods = EnumToArray(Period).map((str: string) => ToTitleCase(str))
const initialPoolFormData: PoolFormData = {
    name: undefined,
    description: undefined,
    amount: undefined,
    period: undefined,
    startDate: undefined,
    startAmount: undefined
}

const validateInputs = (poolFormData: PoolFormData) => {
    let errors = 0;

    if (!poolFormData.name) {
        errors |= PoolFormErrors.NAME;
    }
    if (!poolFormData.amount || poolFormData.amount <= 0) {
        errors |= PoolFormErrors.AMOUNT;
    }
    if (!poolFormData.period) {
        errors |= PoolFormErrors.PERIOD;
    }
    if (!poolFormData.startDate) {
        errors |= PoolFormErrors.START_DATE;
    }
    if (!poolFormData.startAmount || poolFormData.startAmount <= 0) {
        errors |= PoolFormErrors.START_AMOUNT;
    }

    return errors;
};

const PoolForm: React.FC<PoolFormProps> = ({className}) => {
    const dispatch = useAppDispatch();
    const poolDialogOpenState = useAppSelector(selectPoolDialogOpenState);
    const [poolFormData, setPoolFormData] = useState(initialPoolFormData)
    const nextPoolID = useAppSelector(selectNextPoolID);
    const [errors, setErrors] = useState<number>(0);

    const handleChange = (target: string, value: string) => {
        setPoolFormData({
            ...poolFormData,
            [target]: value
        })
    }

    const createPool = () => {
        const validationErrors = validateInputs(poolFormData);
        if (validationErrors > 0) {
            setErrors(0);
            setTimeout(() => {
                setErrors(validationErrors);
            }, 0);
            return;
        }
    
        let pool: PPLPool = {
            id: nextPoolID,
            name: poolFormData.name!,
            description: poolFormData.description || "",
            amount: poolFormData.amount!,
            period: poolFormData.period!,
            startDate: dayjs(poolFormData.startDate!),
            startAmount: poolFormData.startAmount!,
        };
    
        dispatch(addPool(SerializeToPoolDto(pool)));
        setPoolFormData(initialPoolFormData);
        dispatch(closePoolDialog());
    };

    return (
        <OverlayDialog onClose={() => dispatch(closePoolDialog())} show={poolDialogOpenState}>
            <div className="bg-zinc-300 h-fit w-fit rounded-lg">
                <form>
                    <Fieldset className={"p-6"}>
                        <Legend className={"text-6xl"}>New PPL Pool</Legend>
                        <Field>
                            <Label className={"block text-3xl"}>Pool Name</Label>
                            <GradientFocusInput
                                invalid={(errors & PoolFormErrors.NAME) > 0}
                                className="h-10 w-60"
                                focusClassName="bg-linear-to-tr from-sky-300 to-red-400 shadow-lg"
                                unfocusedClassName="bg-zinc-300">
                                <Input
                                    autoFocus
                                    name="name"
                                    value={poolFormData.name}
                                    onClick={() => setErrors(errors & ~PoolFormErrors.NAME)}
                                    onChange={(e) => handleChange(e.target.name, e.target.value)}
                                    className={(errors & PoolFormErrors.NAME) > 0 ? 'border-red-500' : ''}
                                />
                            </GradientFocusInput>
                        </Field>
                        <Field>
                            <Label className={"block text-3xl"}>Description</Label>
                            <GradientFocusInput
                                className="w-60 h-20"
                                focusClassName="bg-linear-to-tr from-sky-300 to-red-400 shadow-lg"
                                unfocusedClassName="bg-zinc-300">
                                <Textarea
                                    name="description"
                                    value={poolFormData.description}
                                    onChange={(e) => handleChange(e.target.name, e.target.value)}
                                />
                            </GradientFocusInput>
                        </Field>
                        <Field className={"inline mr-1"}>
                            <Label className={"block text-3xl mt-2"}>Accrual Rate</Label>
                            <GradientFocusInput
                                invalid={(errors & PoolFormErrors.AMOUNT) > 0}
                                className="h-10 w-20 mr-1 inline-block"
                                focusClassName="bg-linear-to-tr from-sky-300 to-red-400 shadow-lg"
                                unfocusedClassName="bg-zinc-300">
                                <Input
                                    name="amount"
                                    value={poolFormData.amount}
                                    onClick={() => setErrors(errors & ~PoolFormErrors.AMOUNT)}
                                    onChange={(e) => handleChange(e.target.name, e.target.value)}
                                    className={(errors & PoolFormErrors.AMOUNT) > 0 ? 'border-red-500' : ''}
                                />
                            </GradientFocusInput>
                            <Label>hours</Label>
                        </Field>
                        <Field className={"inline"}>
                            <Listbox value={poolFormData.period}
                                onChange={(e) => handleChange("period", e)}>
                                <ListboxButton className={"relative h-10 w-40 p-2 pr-10 rounded-lg bg-black/10"}>
                                    {poolFormData.period}
                                    <ChevronDownIcon
                                        className="group pointer-events-none absolute top-2.5 right-2.5 size-4 fill-black/60"
                                        aria-hidden="true"
                                    />
                                </ListboxButton>
                                <ListboxOptions anchor="bottom" className={clsx('w-[var(--button-width)] rounded-xl border border-black/10 bg-zinc-300/95 p-1 [--anchor-gap:var(--spacing-1)] focus:outline-hidden transition duration-100 ease-in data-leave:data-closed:opacity-0')}>
                                    {periods.map((period) => (
                                    <ListboxOption key={period}
                                    value={period}
                                    className="group flex cursor-default items-center gap-2 rounded-lg py-1.5 px-3 select-none data-focus:bg-white/10">
                                        <CheckIcon className={"invisible size-6 fill-black group-data-selected:visible"}/>
                                        {period}
                                    </ListboxOption>
                                    ))}
                                </ListboxOptions>
                            </Listbox>
                        </Field>
                        <Field className={"mt-2"}>
                            <Label className={"text-3xl block"}>Starting on</Label>
                            <GradientFocusInput
                                invalid={(errors & PoolFormErrors.START_DATE) > 0}
                                className="h-10 w-auto mr-1 inline-block"
                                focusClassName="bg-linear-to-tr from-sky-300 to-red-400 shadow-lg"
                                unfocusedClassName="bg-zinc-300">
                                <Input
                                    name="startDate"
                                    type="date"
                                    onClick={() => setErrors(errors & ~PoolFormErrors.START_DATE)}
                                    value={poolFormData.startDate}
                                    onChange={(e) => handleChange(e.target.name, e.target.value)}
                                    className={(errors & PoolFormErrors.START_AMOUNT) > 0 ? 'border-red-500' : ''}
                                />
                            </GradientFocusInput>
                            <Label className={"mx-1"}>With</Label>
                            <GradientFocusInput
                                invalid={(errors & PoolFormErrors.START_AMOUNT) > 0}
                                className="h-10 w-20 mr-1 inline-block"
                                focusClassName="bg-linear-to-tr from-sky-300 to-red-400 shadow-lg"
                                unfocusedClassName="bg-zinc-300">
                                <Input
                                    name="startAmount"
                                    value={poolFormData.startAmount}
                                    onClick={() => setErrors(errors & ~PoolFormErrors.START_AMOUNT)}
                                    onChange={(e) => handleChange(e.target.name, e.target.value)}
                                    className={(errors & PoolFormErrors.START_AMOUNT) > 0 ? 'border-red-500' : ''}
                                />
                            </GradientFocusInput>
                            <Label>hours</Label>
                        </Field>
                        <Field className={"mt-4"}>
                            <Button
                            className={"w-full rounded-lg p-2 text-3xl bg-black/10 text-zinc-700 hover:cursor-pointer hover:shadow-lg transition duration-150 ease-in-out hover:scale-102"}
                            onClick={() => createPool()}>Create</Button>
                        </Field>
                    </Fieldset>
                </form>
            </div>
        </OverlayDialog>
    );
}

export default PoolForm