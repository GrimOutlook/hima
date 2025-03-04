'use client'
import { Dialog, Transition, TransitionChild } from "@headlessui/react";
import { Fragment, useState } from "react";

import EventsList from "./components/events_list";
import PoolList from "./components/pools_list";
import SettingsButton from "./components/settings_button";
import TotalHoursCard from "./components/total_hours_card";
import PoolForm from "./components/pool_form";
import { useAppDispatch, useAppSelector } from "@/lib/hooks";
import { closePoolDialog, selectPoolDialogOpenState } from "@/lib/features/poolDialogSlice";

export default function Home() {
  const dispatch = useAppDispatch();
  const poolDialogOpenState = useAppSelector(selectPoolDialogOpenState);

  return (
    <>
      <div className="flex flex-row text-gray-700 bg-gradient-to-tl to-zinc-900 from-zinc-700 w-full max-h-full">
        {/* <!-- Left side --> */}
        <div className="flex flex-col min-w-64 max-w-100 ml-2 my-2 max-h-dvh">
          {/* Logo banner */}
          {/* Make a color gradient for the logo text */}
          <div className="self-center w-full">
              {/* Make a color gradient for the hours text */}
              <div className="text-transparent self-center bg-clip-text bg-gradient-to-tr from-sky-300 to-red-400">
                  {/* <!-- Hour --> */}
                  <div className="text-[10rem] leading-none text-center font-black line-clamp-1">HIMA</div>
              </div>
          </div>
          {/* <!-- Top box --> */}
          <div className="flex-none grow-0 basis-0">
            <TotalHoursCard hours={26}/>
          </div>
          {/* <!-- Middle box --> */}
          <div className="flex-none grow flex flex-col">
            <PoolList className="mt-2 grow"/>
          </div>
          {/* <!-- Bottom box --> */}
          <div className="flex-none grow-0 basis-0">
            <SettingsButton className="mt-2 h-24 w-full"/>
          </div>
        </div>
        
        {/* <!-- Right side --> */}
        <div className="min-w-48 grow flex">
            <EventsList className="grow"/>
        </div>
      </div>
      
      <Transition appear show={poolDialogOpenState} as={Fragment}>
        <Dialog 
          open={poolDialogOpenState}
          onClose={() => dispatch(closePoolDialog())}
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
            <div className="fixed inset-0 bg-black bg-opacity-50" onClick={() => dispatch(closePoolDialog())} />
          </TransitionChild>

          <div className="fixed inset-0 self-center justify-self-center">
            <PoolForm/>
          </div>
        </Dialog>
      </Transition>
    </>
  );
}
