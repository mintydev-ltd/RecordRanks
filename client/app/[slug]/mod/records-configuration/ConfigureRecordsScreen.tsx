"use client";

import { faCopy, faPencil } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useAction } from "next-safe-action/hooks";
import { useContext, useState } from "react";
import useSWR from "swr";
import GenerateRecordConfigsForm from "~/app/[slug]/mod/records-configuration/GenerateRecordConfigsForm.tsx";
import Form from "~/app/components/form/Form.tsx";
import FormCheckbox from "~/app/components/form/FormCheckbox.tsx";
import FormNumberInput from "~/app/components/form/FormNumberInput.tsx";
import FormSelect from "~/app/components/form/FormSelect.tsx";
import FormTextInput from "~/app/components/form/FormTextInput.tsx";
import ActiveInactiveIcon from "~/app/components/UI/ActiveInactiveIcon.tsx";
import Button from "~/app/components/UI/Button.tsx";
import ColorSquare from "~/app/components/UI/ColorSquare.tsx";
import ToastMessages from "~/app/components/UI/ToastMessages.tsx";
import { C } from "~/helpers/constants.ts";
import { MainContext } from "~/helpers/contexts.ts";
import { recordCategoryOptions } from "~/helpers/multipleChoiceOptions.ts";
import { SwrKey } from "~/helpers/swr-keys.ts";
import { type ListPageMode, type RecordCategory, RecordCategoryValues } from "~/helpers/types.ts";
import { getActionError } from "~/helpers/utility-functions.ts";
import type { RecordConfigDto } from "~/helpers/validators/RecordConfig.ts";
import type { RecordConfigResponse } from "~/server/db/schema/record-configs.ts";
import type { RegionResponse } from "~/server/db/schema/regions.ts";
import {
  createRecordConfigSF,
  generateRecordConfigsSF,
  updateRecordConfigSF,
} from "~/server/server-functions/record-config-server-functions.ts";

const RecordTypeLabels = {
  WR: "World Record",
  ER: "European Record",
  NAR: "North American Record",
  SAR: "South American Record",
  AsR: "Asian Record",
  AfR: "African Record",
  OcR: "Oceanic Record",
  NR: "National Record",
} as const;

type Props = {
  recordConfigs: RecordConfigResponse[];
};

function ConfigureRecordsScreen({ recordConfigs: initRecordConfigs }: Props) {
  const { changeErrorMessages, changeSuccessMessage, resetMessages } = useContext(MainContext);

  const { executeAsync: createRecordConfig, isPending: isCreating } = useAction(createRecordConfigSF);
  const { executeAsync: updateRecordConfig, isPending: isUpdating } = useAction(updateRecordConfigSF);
  const { executeAsync: generateRecordConfigs, isPending: isGenerating } = useAction(generateRecordConfigsSF);
  const { data: regions }: { data: RegionResponse[] } = useSWR(SwrKey.Regions, { suspense: true });
  const [mode, setMode] = useState<ListPageMode | "generate">("view");
  const [recordConfigs, setRecordConfigs] = useState(initRecordConfigs);

  const [recordConfigIdUnderEdit, setRecordConfigIdUnderEdit] = useState<number | undefined>();
  const [category, setCategory] = useState<RecordCategory>(RecordCategoryValues[0]);
  const [recordTypeId, setRecordTypeId] = useState("WR");
  const [label, setLabel] = useState("");
  const [active, setActive] = useState(true);
  const [rank, setRank] = useState<number | undefined>();
  const [color, setColor] = useState<string>(C.color.danger);

  const isPending = isCreating || isUpdating;
  const generatableRecordCategories = RecordCategoryValues.filter(
    (rcv) => !recordConfigs.some((rc) => rc.category === rcv),
  );

  const handleSubmit = async () => {
    const newRecordConfigDto = {
      category,
      recordTypeId,
      label,
      active,
      rank: rank!,
      color,
    } satisfies RecordConfigDto;

    const res =
      mode === "add"
        ? await createRecordConfig({ newRecordConfigDto })
        : await updateRecordConfig({ id: recordConfigIdUnderEdit!, newRecordConfigDto });

    if (res.serverError || res.validationErrors) {
      changeErrorMessages([getActionError(res)]);
    } else {
      changeSuccessMessage(`Record type successfully ${mode === "add" ? "created" : "updated"}`);
      setMode("view");

      const newRecordConfigs =
        mode === "add"
          ? [...recordConfigs, res.data!]
          : recordConfigs.map((rc) => (rc.id === recordConfigIdUnderEdit ? res.data! : rc));
      newRecordConfigs.sort((a, b) => a.rank - b.rank);
      setRecordConfigs(newRecordConfigs);
    }
  };

  // const onAddRecordConfig = () => {
  //   resetMessages();
  //   setMode("add");

  //   setRecordConfigIdUnderEdit(undefined);
  //   setCategory("competitions");
  //   setRecordTypeId("WR");
  //   setLabel("");
  //   setActive(true);
  //   setRank(undefined);
  //   setColor(C.color.danger);
  // };

  const onEditRecordConfig = (recordConfig: RecordConfigResponse, clone = false) => {
    window.scrollTo(0, 0);
    resetMessages();
    setMode(clone ? "add" : "edit");

    setRecordConfigIdUnderEdit(clone ? undefined : recordConfig.id);
    setCategory(recordConfig.category);
    setRecordTypeId(recordConfig.recordTypeId);
    setLabel(recordConfig.label);
    setActive(recordConfig.active);
    setRank(recordConfig.rank);
    setColor(recordConfig.color);
  };

  const onGenerateRecordConfigs = () => {
    resetMessages();
    setMode("generate");
  };

  const submitGeneratedRecordConfigs = async (formData: FormData) => {
    resetMessages();
    const res = await generateRecordConfigs(Object.fromEntries(formData.entries()) as any);

    if (res.serverError || res.validationErrors) {
      changeErrorMessages([getActionError(res)]);
    } else {
      changeSuccessMessage("Record types successfully generated");
      setMode("view");

      const newRecordConfigs = [...recordConfigs, ...res.data!];
      newRecordConfigs.sort((a, b) => a.rank - b.rank);
      setRecordConfigs(newRecordConfigs);
    }
  };

  const cancel = () => {
    setMode("view");
    resetMessages();
  };

  const changeRecordTypeId = (newRecordTypeId: string) => {
    setRecordTypeId(newRecordTypeId);

    if (newRecordTypeId === "WR") setColor(C.color.danger);
    else if (regions.some((r) => r.type === "super-region" && r.superRegionRecordType === newRecordTypeId))
      setColor(C.color.warning);
    else if (newRecordTypeId === "NR") setColor(C.color.success);
    else setColor(C.color.primary);
  };

  return (
    <>
      <ToastMessages className="mx-2" />

      {mode === "view" ? (
        <div className="d-flex gap-3 px-2">
          {/* <Button onClick={onAddRecordConfig} className="btn-success btn-sm">
            Create Record Type
          </Button> */}
          {generatableRecordCategories.length > 0 && (
            <Button onClick={onGenerateRecordConfigs} className="btn-secondary btn-sm">
              Generate Record Types
            </Button>
          )}
        </div>
      ) : mode === "generate" ? (
        <GenerateRecordConfigsForm
          recordCategories={generatableRecordCategories}
          isSubmitting={isGenerating}
          onSubmit={submitGeneratedRecordConfigs}
          onCancel={cancel}
        />
      ) : (
        <Form onSubmit={handleSubmit} onCancel={cancel} hideToasts isLoading={isPending}>
          <div className="row">
            <div className="col-md-6 mb-3">
              <FormSelect
                title="Record Category"
                options={recordCategoryOptions}
                selected={category}
                setSelected={setCategory as any}
                // disabled={isPending}
                disabled
              />
            </div>
            <div className="col-md-6 mb-3">
              <FormTextInput
                title="Record Type"
                value={recordTypeId}
                setValue={changeRecordTypeId}
                // disabled={isPending}
                disabled
              />
            </div>
          </div>
          <div className="row">
            <div className="col-md-6 mb-3">
              <FormTextInput title="Label" value={label} setValue={setLabel} disabled={isPending} />
            </div>
            <div className="col-md-6 mb-3">
              <FormNumberInput
                title="Rank"
                tooltip="Only used for ordering the record types on this page"
                value={rank}
                setValue={setRank}
                disabled={isPending}
              />
            </div>
          </div>
          <div className="row">
            <div className="col-md-6 mb-3">
              <label htmlFor="color_input" className="form-label fw-semibold d-block mb-2">
                Color
              </label>
              <input
                id="color_input"
                type="color"
                value={color}
                onChange={(e) => setColor(e.target.value)}
                disabled={isPending}
              />
            </div>
            <div className="col-md-6 mb-3">
              <FormCheckbox title="Active" checked={active} setChecked={setActive} disabled={isPending} />
            </div>
          </div>
        </Form>
      )}

      <div className="table-responsive my-4">
        <table className="table-hover table text-nowrap">
          <thead>
            <tr>
              <th scope="col">#</th>
              <th scope="col">Record category</th>
              <th scope="col">Record type</th>
              <th scope="col">Label</th>
              <th scope="col">Rank</th>
              <th scope="col">Color</th>
              <th scope="col">Active</th>
              <th scope="col">Actions</th>
            </tr>
          </thead>
          <tbody>
            {recordConfigs.map((recordConfig, index) => (
              <tr key={recordConfig.id}>
                <td>{index + 1}</td>
                <td>{recordCategoryOptions.find((rf) => rf.value === recordConfig.category)?.label}</td>
                <td>{(RecordTypeLabels as any)[recordConfig.recordTypeId]}</td>
                <td>{recordConfig.label}</td>
                <td>{recordConfig.rank}</td>
                <td>
                  <ColorSquare color={recordConfig.color} small />
                </td>
                <td>
                  <ActiveInactiveIcon isActive={recordConfig.active} />
                </td>
                <td>
                  <div className="d-flex gap-2">
                    <Button
                      onClick={() => onEditRecordConfig(recordConfig)}
                      disabled={mode !== "view"}
                      className="btn-xs"
                      title="Edit"
                      ariaLabel="Edit"
                    >
                      <FontAwesomeIcon icon={faPencil} />
                    </Button>
                    <Button
                      onClick={() => onEditRecordConfig(recordConfig, true)}
                      disabled={mode !== "view"}
                      className="btn-xs"
                      title="Clone"
                      aria-label="Clone"
                    >
                      <FontAwesomeIcon icon={faCopy} />
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

export default ConfigureRecordsScreen;
