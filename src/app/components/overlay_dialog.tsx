'use client'

import { Dialog, Transition, TransitionChild } from "@headlessui/react";
import { Fragment, JSX } from "react";


type OverlayDialogProps = {
    children?: string | JSX.Element | JSX.Element[];
    show: boolean;
    onClose: (value: any) => void;
}

export const OverlayDialog: React.FC<OverlayDialogProps> = ({children, show, onClose}) => {
    return (
        <Transition appear show={show} as={Fragment}>
            <Dialog 
            open={show}
            onClose={onClose}
            as="div" className="relative z-10">
                
                <TransitionChild
                    as={Fragment}
                    enter="ease-out duration-300"
                    enterFrom="opacity-0"
                    enterTo="opacity-100"
                    leave="ease-in duration-200"
                    leaveFrom="opacity-100"
                    leaveTo="opacity-0"
                >
                    <div className="fixed inset-0 bg-black/50" onClick={onClose} />
                </TransitionChild>
                <div className="fixed inset-0 self-center justify-self-center">
                    {children}
                </div>
            </Dialog>
        </Transition>
    )
}