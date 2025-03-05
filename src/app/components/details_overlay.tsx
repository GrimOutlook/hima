import { Dialog, Label, Transition, TransitionChild } from "@headlessui/react"


import { Fragment, JSX } from "react";


type DetailsOverlayProps = {
    children?: string | JSX.Element | JSX.Element[];
    show?: boolean;
    onClose: (value: any) => void;
}


export const DetailsOverlay: React.FC<DetailsOverlayProps> = ({onClose, show, children}) => {
    return (
        <Transition appear show={show} as={Fragment}>
            <Dialog 
            open={show}
            onClose={onClose}
            as="div" className={"size-32 z-10"}>
                
                <TransitionChild
                    as={Fragment}
                    enter="ease-out duration-300"
                    enterFrom="opacity-0"
                    enterTo="opacity-100"
                    leave="ease-in duration-200"
                    leaveFrom="opacity-100"
                    leaveTo="opacity-0"
                >
                    <div className={``}>
                        {children}
                    </div>
                </TransitionChild>
            </Dialog>
        </Transition>
    )
}