import { useQueryClient } from "@tanstack/react-query";
import {
  useAddVocabSelection,
  useDeleteVocabSelection,
  getListVocabSelectionsQueryKey,
  type VocabSelection,
} from "@workspace/api-client-react";
import { isSubscriptionVerificationError } from "@/lib/subscriptionError";

// Module-level counter so two rapid adds can never share a temp id,
// even across the Bank and Search tabs (they share the same cache).
let optimisticIdCounter = -1;
const nextOptimisticId = () => optimisticIdCounter--;

/**
 * Shared add/remove mutations for the "My Words" selection list, with
 * race-safe optimistic updates:
 * - onMutate applies the change to the cache immediately (unique negative
 *   temp id for adds), so the button flips without waiting for the network.
 * - No whole-list snapshots/rollbacks: on error we alert and refetch the
 *   server truth, so a rollback can never erase another pending mutation.
 * - The settle-time refetch only fires when this is the LAST pending
 *   mutation, so an early refetch can't overwrite another optimistic row.
 */
export function useVocabSelectionMutations(
  targetLanguage: string,
  onError: () => void,
) {
  const queryClient = useQueryClient();
  const selectionsKey = getListVocabSelectionsQueryKey({ targetLanguage });

  // Refetch server truth, but only once no other add/delete is in flight.
  const invalidateWhenIdle = () => {
    if (queryClient.isMutating() <= 1) {
      queryClient.invalidateQueries({ queryKey: selectionsKey });
    }
  };

  const handleError = (error: unknown) => {
    // The global mutation handler already explains verification failures.
    if (!isSubscriptionVerificationError(error)) onError();
    invalidateWhenIdle();
  };

  const addMutation = useAddVocabSelection({
    mutation: {
      onMutate: async ({ data }) => {
        await queryClient.cancelQueries({ queryKey: selectionsKey });
        const tempId = nextOptimisticId();
        queryClient.setQueryData<VocabSelection[]>(selectionsKey, (old) => [
          ...((old ?? []) as VocabSelection[]),
          { ...(data as VocabSelection), id: tempId },
        ]);
        return { tempId };
      },
      onError: (error, _variables, context) => {
        // A failed refetch must not leave an unsaved optimistic word on screen.
        queryClient.setQueryData<VocabSelection[]>(selectionsKey, (old) =>
          old?.filter((word) => word.id !== context?.tempId),
        );
        handleError(error);
      },
      onSuccess: (saved, _variables, context) => {
        queryClient.setQueryData<VocabSelection[]>(selectionsKey, (old) =>
          old?.map((word) => word.id === context?.tempId ? saved : word),
        );
        invalidateWhenIdle();
      },
    },
  });

  const deleteMutation = useDeleteVocabSelection({
    mutation: {
      onMutate: async ({ id }) => {
        await queryClient.cancelQueries({ queryKey: selectionsKey });
        queryClient.setQueryData<VocabSelection[]>(selectionsKey, (old) =>
          ((old ?? []) as VocabSelection[]).filter((s) => s.id !== id),
        );
      },
      onError: handleError,
      onSuccess: invalidateWhenIdle,
    },
  });

  return { addMutation, deleteMutation };
}
