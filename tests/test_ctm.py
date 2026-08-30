"""Checks that the implementation actually does what the paper says."""

import math
import random

import pytest

from ctm.build import build
from ctm.chunk import Chunk, Gist
from ctm.demos import blindsight, free_will_delay, inattentional_blindness, normal_sight
from ctm.uptree import UpTree, additive_f, coin_flip


# ---- section 1.2: the chunk -------------------------------------------------

def test_submitted_chunk_seeds_intensity_and_mood_from_weight():
    c = Chunk.submitted(3, 7, Gist("vision", "a red ball"), -2.5)
    assert (c.intensity, c.mood) == (2.5, -2.5)


# ---- section 1.3: the coin-flip neuron --------------------------------------

def test_coin_flip_is_proportional():
    rng = random.Random(0)
    heads = sum(coin_flip(3.0, 1.0, rng) for _ in range(20000))
    assert heads / 20000 == pytest.approx(0.75, abs=0.02)


def test_coin_flip_is_fair_when_both_zero():
    rng = random.Random(1)
    heads = sum(coin_flip(0.0, 0.0, rng) for _ in range(20000))
    assert heads / 20000 == pytest.approx(0.5, abs=0.02)


def test_coin_flip_rejects_negative_f_values():
    with pytest.raises(ValueError):
        coin_flip(-1.0, 1.0, random.Random(0))


# ---- section 1.3: the theorem ----------------------------------------------

def test_additive_f_gives_each_chunk_its_proportional_share_of_stm():
    """The paper's theorem: for additive f, P(chunk reaches STM) = f(chunk) / sum f."""
    weights = [1.0, 2.0, 3.0, 4.0, 0.5, 0.5, 0.5, 0.5]
    subs = [Chunk.submitted(i, 0, Gist("t", str(i)), w) for i, w in enumerate(weights)]
    expected = [w / sum(weights) for w in weights]

    rng = random.Random(42)
    wins = [0] * len(weights)
    trials = 20000
    for _ in range(trials):
        tree = UpTree(len(weights), additive_f(0.0), rng)
        for _ in range(tree.h + 1):
            root = tree.tick(subs)
        wins[root.address] += 1

    for got, want in zip((w / trials for w in wins), expected):
        assert got == pytest.approx(want, abs=0.015)


def test_leaf_permutation_does_not_change_the_shares():
    """A corollary the paper draws: with additive f the assignment of processors
    to leaves has no effect on what gets broadcast."""
    weights = [1.0, 2.0, 3.0, 4.0]
    order = [3, 1, 0, 2]
    trials = 12000

    def shares(perm):
        subs = [Chunk.submitted(i, 0, Gist("t", str(i)), weights[i]) for i in perm]
        rng = random.Random(7)
        wins = {i: 0 for i in range(4)}
        for _ in range(trials):
            tree = UpTree(4, additive_f(0.0), rng)
            for _ in range(tree.h + 1):
                root = tree.tick(subs)
            wins[root.address] += 1
        return [wins[i] / trials for i in range(4)]

    for a, b in zip(shares(range(4)), shares(order)):
        assert a == pytest.approx(b, abs=0.02)


def test_root_accumulates_every_leafs_intensity_and_mood():
    weights = [5.0, -3.0, 2.0, -1.0]
    subs = [Chunk.submitted(i, 0, Gist("t", str(i)), w) for i, w in enumerate(weights)]
    tree = UpTree(4, additive_f(0.0), random.Random(0))
    for _ in range(tree.h + 1):
        root = tree.tick(subs)
    assert root.intensity == pytest.approx(sum(abs(w) for w in weights))
    assert root.mood == pytest.approx(sum(weights))


def test_mood_coefficient_outside_unit_interval_is_rejected():
    with pytest.raises(ValueError):
        additive_f(1.5)


# ---- section 1.4: the delay -------------------------------------------------

def test_awareness_lags_submission_by_h_plus_one():
    machine, world, p = build(seed=0)
    assert machine.h == math.ceil(math.log2(len(machine.processors)))
    assert machine.latency == machine.h + 1


def test_a_submitted_chunk_reaches_stm_exactly_h_ticks_later():
    machine, world, p = build(seed=0, n_idle=8)
    # Silence everything but one very loud processor, so the winner is forced.
    for proc in machine.processors:
        proc.propose = lambda t: None
    loud = machine.processors[0]
    loud.propose = lambda t: (Gist("test", "the only voice"), 10.0)

    seen_at = None
    for _ in range(machine.h + 3):
        machine.tick()
        if machine.stm is not None and seen_at is None:
            seen_at = machine.t - 1
            assert machine.t - 1 - machine.stm.t == machine.h
    assert seen_at is not None


# ---- section 1.1: links and unconscious traffic -----------------------------

def test_links_form_only_after_repeated_acknowledgement():
    machine, _, p = build(seed=0)
    links = machine.links
    assert not links.linked("vision", "motor")
    for _ in range(links.threshold - 1):
        links.acknowledge("vision", "motor")
    assert not links.linked("vision", "motor")
    links.acknowledge("vision", "motor")
    assert links.linked("vision", "motor")


def test_unlinked_processors_cannot_talk_off_stage():
    machine, _, _ = build(seed=0)
    chunk = Chunk.submitted(0, 0, Gist("vision", "x"), 1.0)
    assert machine.links.send("vision", "motor", chunk, 0) is False


# ---- section 1.6: sleeping experts ------------------------------------------

def test_a_processor_that_keeps_losing_raises_its_own_volume():
    machine, world, p = build(seed=17)
    p["task"].engaged = True
    vision = p["vision"]
    before = vision.boldness
    for _ in range(40):
        world.poke("vision", "something important", strength=1.0, duration=1)
        machine.tick()
    assert vision.boldness > before


# ---- chapter 3: the phenomena ----------------------------------------------

def test_blindsight_acts_without_awareness():
    r = blindsight(verbose=False)
    assert r["conscious_of_vision"] is False
    assert r["acted"] is True
    assert r["routes"]["unconscious"] > 0
    assert r["routes"]["conscious"] == 0


def test_intact_vision_is_the_control_for_blindsight():
    assert normal_sight(verbose=False)["conscious_of_vision"] is True


def test_inattentional_blindness_depends_only_on_the_competition():
    r = inattentional_blindness(verbose=False)
    assert r["engaged"] is False
    assert r["disengaged"] is True


def test_the_act_precedes_the_feeling():
    r = free_will_delay(verbose=False)
    assert r["acted"] is not None and r["aware"] is not None
    assert r["acted"] < r["aware"]
