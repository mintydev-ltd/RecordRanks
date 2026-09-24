"use client";

import { faCheck, faXmark } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useAction } from "next-safe-action/hooks";
import { useContext, useState } from "react";
import Person from "~/app/components/Person.tsx";
import ActiveInactiveIcon from "~/app/components/UI/ActiveInactiveIcon.tsx";
import Button from "~/app/components/UI/Button.tsx";
import { MainContext } from "~/helpers/contexts.ts";
import { getActionError } from "~/helpers/utility-functions.ts";
import type { FullMemberRequest } from "~/server/db/schema/member-requests.ts";
import { orgRolesObject } from "~/server/organization-permissions.ts";
import { approveMemberRequestSF, deleteMemberRequestSF } from "~/server/server-functions/user-server-functions.ts";

type Props = {
  memberRequests: FullMemberRequest[];
};

function MemberRequestsScreen({ memberRequests: initMemberRequests }: Props) {
  const { changeErrorMessages, changeSuccessMessage, resetMessages } = useContext(MainContext);

  const { executeAsync: approveMemberRequest, isPending: isApproving } = useAction(approveMemberRequestSF);
  const { executeAsync: deleteMemberRequest, isPending: isRejecting } = useAction(deleteMemberRequestSF);
  const [loadingId, setLoadingId] = useState("");
  const [memberRequests, setMemberRequests] = useState(initMemberRequests);

  const isPending = isApproving || isRejecting;

  const approveRequest = async (id: number) => {
    resetMessages();
    setLoadingId(`approve_request_${id}_button`);
    const res = await approveMemberRequest(id);

    if (res.serverError || res.validationErrors) {
      changeErrorMessages([getActionError(res)]);
    } else {
      setMemberRequests(memberRequests.filter((mr) => mr.id !== id));
      changeSuccessMessage("Request successfully approved");
    }
    setLoadingId("");
  };

  const rejectRequest = async (id: number) => {
    resetMessages();
    setLoadingId(`reject_request_${id}_button`);
    const res = await deleteMemberRequest(id);

    if (res.serverError || res.validationErrors) {
      changeErrorMessages([getActionError(res)]);
    } else {
      setMemberRequests(memberRequests.filter((mr) => mr.id !== id));
      changeSuccessMessage("Request successfully rejected");
    }
    setLoadingId("");
  };

  return (
    <>
      <p className="mb-4 px-2">
        Please note that the competitor profile must be approved before you can approve the request
      </p>

      {memberRequests.length === 0 ? (
        <p className="fs-5 px-2">No requests have been submitted yet</p>
      ) : (
        <div className="table-responsive mt-3">
          <table className="table-hover table text-nowrap">
            <thead>
              <tr>
                <th scope="col">Name</th>
                <th scope="col">Email</th>
                <th scope="col">Requested Profile</th>
                <th scope="col">Requested Role</th>
                <th scope="col">Comment</th>
                <th scope="col">Actions</th>
              </tr>
            </thead>
            <tbody>
              {memberRequests.map((mr) => (
                <tr key={mr.id}>
                  <td>{mr.user.name}</td>
                  <td>{mr.user.email}</td>
                  <td>
                    {mr.requestedPerson && (
                      <div className="d-flex gap-3 align-items-center">
                        <Person person={mr.requestedPerson} showId showWcaLink />
                        <ActiveInactiveIcon isActive={mr.requestedPerson.approved} />
                      </div>
                    )}
                  </td>
                  <td>
                    {mr.requestedRole &&
                      (mr.requestedRole in orgRolesObject ? (
                        (orgRolesObject as any)[mr.requestedRole]
                      ) : (
                        <span className="text-danger">ERROR</span>
                      ))}
                  </td>
                  <td>
                    <div style={{ minWidth: "10rem", maxWidth: "25rem", whiteSpace: "pre-wrap" }}>{mr.comment}</div>
                  </td>
                  <td>
                    <div className="d-flex gap-2">
                      <Button
                        id={`approve_request_${mr.id}_button`}
                        onClick={() => approveRequest(mr.id)}
                        disabled={isPending}
                        loadingId={loadingId}
                        className="btn-xs btn-success"
                        title="Approve"
                        ariaLabel="Approve"
                      >
                        <FontAwesomeIcon icon={faCheck} />
                      </Button>
                      <Button
                        id={`reject_request_${mr.id}_button`}
                        onClick={() => rejectRequest(mr.id)}
                        disabled={isPending}
                        loadingId={loadingId}
                        className="btn-xs btn-danger"
                        title="Reject"
                        ariaLabel="Reject"
                      >
                        <FontAwesomeIcon icon={faXmark} />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

export default MemberRequestsScreen;
