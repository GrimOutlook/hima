'use client'

import { Button, Field, Fieldset, Input, Label, Legend, Listbox, ListboxButton, ListboxOption, ListboxOptions } from "@headlessui/react";
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
import OverlayDialog from "./overlay_dialog";

type PoolFormProps = {
    className?: string;
}

type PoolFormData = {
    name: string,
    description: string,
    amount: number,
    period: Period,
    startDate: string,
    startAmount: number,
}

const periods = EnumToArray(Period).map((str: string) => ToTitleCase(str))
const initialPoolFormData: PoolFormData = {
    name: "",
    description: "",
    amount: 0,
    period: Period.BiWeekly,
    startDate: (new Date().toDateString()),
    startAmount: 0
}

const PoolForm: React.FC<PoolFormProps> = ({className}) => {
    const dispatch = useAppDispatch();
    const poolDialogOpenState = useAppSelector(selectPoolDialogOpenState);
    const [poolFormData, setPoolFormData] = useState(initialPoolFormData)
    const nextPoolID = useAppSelector(selectNextPoolID);
    

    const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
        setPoolFormData({
            ...poolFormData,
            [e.target.name]: e.target.value,
        });
    };

    const handlePeriodChange = (period: Period) => {
        setPoolFormData({
            ...poolFormData,
            period: period
        })
    }

    const handleDateChange = (startDate: string) => {
        setPoolFormData({
            ...poolFormData,
            startDate: startDate
        })
    }

    return (
        <OverlayDialog onClose={() => dispatch(closePoolDialog())} show={poolDialogOpenState}>
            <div className="bg-zinc-300 h-fit w-fit rounded-lg">
                <form>
                    <Fieldset className={"p-6"}>
                        <Legend className={"text-6xl"}>New PPL Pool</Legend>
                        <Field>
                            <Label className={"block text-3xl"}>Pool Name</Label>
                            <Input className={"w-50 rounded-lg border-none bg-black/10 p-2"} name="name" value={poolFormData.name} onChange={(e) => handleChange(e)}/>
                        </Field>
                        <Label className={"block text-3xl mt-2"}>Accrual Rate</Label>
                        <Field className={"inline mr-1"}>
                            <Input className="w-20 rounded-lg border-none bg-black/10 mr-1 p-2" name="amount" value={poolFormData.amount} onChange={(e) => handleChange(e)}/>
                            <Label>hours</Label>
                        </Field>
                        <Field className={"inline"}>
                            <Listbox value={poolFormData.period} onChange={(e) => handlePeriodChange(e)}>
                                <ListboxButton className={"relative w-40 p-2 pr-10 rounded-lg bg-black/10"}>
                                    {poolFormData.period}
                                    <ChevronDownIcon
                                        className="group pointer-events-none absolute top-2.5 right-2.5 size-4 fill-black/60"
                                        aria-hidden="true"
                                    />
                                </ListboxButton>
                                <ListboxOptions anchor="bottom" className={clsx('w-[var(--button-width)] rounded-xl border border-black/10 bg-zinc-300/95 p-1 [--anchor-gap:var(--spacing-1)] focus:outline-none transition duration-100 ease-in data-[leave]:data-[closed]:opacity-0')}>
                                    {periods.map((period) => (
                                    <ListboxOption key={period} value={period} className="group flex cursor-default items-center gap-2 rounded-lg py-1.5 px-3 select-none data-[focus]:bg-white/10">
                                        <CheckIcon className="invisible size-4 fill-black group-data-[selected]:visible"/>
                                        {period}
                                    </ListboxOption>
                                    ))}
                                </ListboxOptions>
                            </Listbox>
                        </Field>
                        <Field className={"mt-2"}>
                            <Label className={"text-3xl block"}>Starting on</Label>
                            <Input className="rounded-lg bg-black/10 p-2" type="date" value={poolFormData.startDate} onChange={(e) => handleDateChange(e.target.value)}/>
                            <Label className={"mx-1"}>With</Label>
                            <Input className="w-20 rounded-lg border-none bg-black/10 mr-1 p-2" name="startAmount" value={poolFormData.startAmount} onChange={(e) => handleChange(e)}/>
                            <Label>hours</Label>
                        </Field>
                        <Field className={"mt-2"}>
                        </Field>
                        <Field className={"mt-2"}>
                            <Button className={"w-full rounded-lg p-2 text-3xl bg-black/10 text-zinc-700"} onClick={() => {
                                let pool : PPLPool = {
                                    id: nextPoolID,
                                    name: poolFormData.name,
                                    description: poolFormData.description,
                                    amount: poolFormData.amount,
                                    period: poolFormData.period,
                                    startDate: dayjs(poolFormData.startDate),
                                    startAmount : poolFormData.startAmount,
                                }
                                dispatch(addPool(SerializeToPoolDto(pool)))
                                dispatch(closePoolDialog())
                            }}>Create</Button>
                        </Field>
                    </Fieldset>
                </form>
            </div>
        </OverlayDialog>
    );
}

export default PoolForm