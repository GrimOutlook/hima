import React from "react";

type LogoProps = {
  className?: string;
};

export const Logo: React.FC<LogoProps> = ({ className }) => (
  <>
    {/* Logo banner */}
    {/* Make a color gradient for the logo text */}
    <div className={className}>
      {/* Make a color gradient for the hours text */}
      <div
        className={`text-transparent self-center bg-clip-text
          bg-linear-to-tr from-sky-300 to-red-400`}
      >
        {/* <!-- Hour --> */}
        <div
          className={`text-[9rem] leading-none text-center font-black
            line-clamp-1`}
        >
          HIMA
        </div>
      </div>
    </div>
  </>
);
