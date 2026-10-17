package com.bloodstock.util;

import java.util.function.DoubleSupplier;

/**
 * Mulberry32 32-bit deterministic PRNG ported faithfully from JavaScript.
 * Formula: ((t ^ (t >>> 14)) & 0xFFFFFFFFL) / 4294967296.0
 * with 32-bit integer overflow arithmetic matching JavaScript's Math.imul.
 */
public class Mulberry32 implements DoubleSupplier {

    private int state;

    public Mulberry32(int seed) {
        this.state = seed;
    }

    public static Mulberry32 of(int seed) {
        return new Mulberry32(seed);
    }

    @Override
    public double getAsDouble() {
        return nextDouble();
    }

    public double nextDouble() {
        state += 0x6D2B79F5;
        int t = state;
        t = (t ^ (t >>> 15)) * (t | 1);
        t ^= t + (t ^ (t >>> 7)) * (t | 61);
        return ((t ^ (t >>> 14)) & 0xFFFFFFFFL) / 4294967296.0;
    }
}
