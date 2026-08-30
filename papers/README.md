# Source paper

Lenore Blum & Manuel Blum, *A Theory of Consciousness from a Theoretical Computer
Science Perspective: Insights from the Conscious Turing Machine*.
PNAS 119(21) e2115934119 (2022). arXiv:2107.13704v10.

The PDF and extracted text are gitignored (copyright). To fetch them:

    curl -sL -o papers/blum-blum-ctm-arxiv-2107.13704v10.pdf https://arxiv.org/pdf/2107.13704v10
    pdftotext -layout papers/blum-blum-ctm-arxiv-2107.13704v10.pdf papers/ctm.txt

Sections this implementation follows:

| Paper | Code |
|---|---|
| 1.1 Basic CTM structure (7-tuple) | `ctm/machine.py` |
| 1.2 Brainish, chunks & gists | `ctm/chunk.py` |
| 1.3 Up-Tree competition, coin-flip neuron | `ctm/uptree.py` |
| 1.4 Time delay for conscious awareness | `ctm/machine.py` (`h`, `+1` broadcast) |
| 1.5 Memories & the high level story | `ctm/processor.py` (`history`) |
| 1.6 Predictive dynamics / Sleeping Experts | `ctm/sleeping_experts.py` |
| 3.1 Blindsight | `ctm/demos.py` |
| 3.2 Inattentional blindness | `ctm/demos.py` |
| 3.7 Free will (the Up-Tree delay) | `ctm/demos.py` |
