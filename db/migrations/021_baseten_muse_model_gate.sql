BEGIN;

ALTER TABLE public.training_jobs
DROP CONSTRAINT training_jobs_meta_model_check;

ALTER TABLE public.training_jobs
ADD CONSTRAINT training_jobs_meta_model_check
CHECK (
    base_model =
    'meta-models/muse-spark-open-1026'
);

COMMENT ON CONSTRAINT
    training_jobs_meta_model_check
ON public.training_jobs
IS
    'M12 model gate: exact Meta Muse Spark Open hackathon model via Baseten only.';

COMMIT;
