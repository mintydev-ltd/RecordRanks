import { C } from "~/helpers/constants.ts";

function DonateButton() {
  return (
    <a
      href={C.rrDonationLink}
      target="_blank"
      rel="noreferrer"
      className="tw:no-underline! tw:flex tw:w-max tw:items-center tw:gap-2 tw:rounded-md tw:bg-[#72a4f2] tw:px-3 tw:py-1 tw:font-[Quicksand,Helvetica,sans-serif] tw:font-bold tw:text-sm tw:text-white! tw:hover:bg-[#6997e0] tw:active:bg-[#5e86c7]"
    >
      {/* biome-ignore lint/performance/noImgElement: this is necessary here */}
      <img src="https://storage.ko-fi.com/cdn/cup-border.png" alt="Ko-fi donations" className="tw:h-5" />
      Support RecordRanks
    </a>
  );
}

export default DonateButton;
