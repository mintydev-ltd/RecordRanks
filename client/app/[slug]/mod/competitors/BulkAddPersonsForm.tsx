"use client";

import { parse } from "csv-parse/browser/esm/sync";
import { useAction } from "next-safe-action/hooks";
import { useContext, useState } from "react";
import useSWR from "swr";
import Form from "~/app/components/form/Form.tsx";
import FormTextArea from "~/app/components/form/FormTextArea.tsx";
import { MainContext } from "~/helpers/contexts.ts";
import { useSession } from "~/helpers/hooks.ts";
import { SwrKey } from "~/helpers/swr-keys.ts";
import { clientGetHasPermission, getActionError } from "~/helpers/utility-functions.ts";
import type { PersonDto } from "~/helpers/validators/Person.ts";
import { bulkCreatePersonsSF } from "~/server/server-functions/person-server-functions.ts";

const expectedCsvColumns = ["name", "localized_name", "region_code", "wca_id"];

function parsePersonRow(row: Record<string, string>): PersonDto | null {
  const name = row.name?.trim();
  const localizedName = row.localized_name?.trim() || null;
  const regionCode = row.region_code?.trim().toUpperCase();
  const wcaId = row.wca_id?.trim().toUpperCase() || null;

  // These two fields are required
  if (!name || !regionCode) return null;

  return { name, localizedName, regionCode, wcaId };
}

type Props = {
  onSubmit: () => void;
  onCancel: () => void;
};

function BulkAddPersonsForm({ onSubmit, onCancel }: Props) {
  const { session } = useSession();
  const { changeErrorMessages, changeSuccessMessage, resetMessages } = useContext(MainContext);

  const { executeAsync: bulkCreatePersons, isPending } = useAction(bulkCreatePersonsSF);
  const { data: canBulkCreatePersons } = useSWR(
    session?.activeOrganizationId ? [SwrKey.CanBulkCreatePersons, session] : null,
    () => clientGetHasPermission({ persons: ["bulk-create"] }),
  );

  const [csvData, setCsvData] = useState("");

  const disabled = isPending || !canBulkCreatePersons;

  const parseCsv = (): PersonDto[] => {
    // Try parsing with different delimiters (comma, semicolon, tab)
    let lastError: Error | undefined;
    for (const delimiter of [",", ";", "\t"]) {
      try {
        const parsed = parse<Record<string, string>>(csvData.trim(), {
          columns: true,
          skip_empty_lines: true,
          trim: true,
          relax_column_count: true,
          delimiter,
        });

        if (parsed.length > 0) {
          const header = Object.keys(parsed[0]);
          const hasAnyExpectedColumn = expectedCsvColumns.some((col) => header.includes(col));
          if (!hasAnyExpectedColumn) continue; // wrong delimiter, try the next one

          const persons = parsed.map(parsePersonRow).filter((p): p is PersonDto => p !== null);
          if (persons.length > 0) return persons;
        }
      } catch (err: any) {
        lastError = err;
      }
    }

    changeErrorMessages([
      `Could not parse CSV (${lastError?.message ?? "no valid rows"}). ` +
        "Please ensure the first row is a header with the columns: name, localized_name, region_code, wca_id, " +
        "and that the delimiter is a comma (,), semicolon (;) or tab.",
    ]);
    return [];
  };

  const handleSubmit = async () => {
    resetMessages();
    const newPersons = parseCsv();

    if (newPersons.length > 0) {
      const res = await bulkCreatePersons({ newPersons });

      if (res.serverError || res.validationErrors) {
        changeErrorMessages([getActionError(res)]);
      } else {
        changeSuccessMessage(`Successfully added ${newPersons.length} person(s)`);
        setCsvData("");
        onSubmit();
      }
    }
  };

  return (
    <Form onSubmit={handleSubmit} onCancel={onCancel} disableControls={disabled} isLoading={isPending}>
      <p className="text-gray-500 text-sm">
        Enter CSV data below. Supported columns (in any order): name, localized_name, region_code, wca_id. The first row
        must be a header with those exact column names.
        <strong> Supported delimiters: comma (,), semicolon (;), or tab.</strong> Example:
      </p>
      <code>
        name,localized_name,region_code,wca_id
        <br />
        John Doe,,US,2010DOEJ01
        <br />
        Jane Doe,,CA,2011DOEJ02
      </code>
      <FormTextArea
        title="CSV data"
        value={csvData}
        setValue={setCsvData}
        disabled={disabled}
        rows={10}
        className="mt-4"
      />
      {!canBulkCreatePersons && <p className="text-danger">You don't have permission to bulk-add persons.</p>}
    </Form>
  );
}

export default BulkAddPersonsForm;
