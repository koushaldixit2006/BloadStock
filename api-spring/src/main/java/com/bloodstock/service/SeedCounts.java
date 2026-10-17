package com.bloodstock.service;

import com.bloodstock.domain.BloodRequest;
import com.bloodstock.domain.Unit;

public record SeedCounts(
        long hospitals,
        long routes,
        long units,
        long requests,
        long simState,
        long auditLogs,
        long users,
        Unit heroUnitNearest,
        Unit heroUnitFarther,
        BloodRequest criticalRequest,
        String genesisHash
) {}
