package com.bloodstock.domain;

import com.fasterxml.jackson.annotation.JsonProperty;

import java.time.Instant;
import java.util.List;

public record FeasibilityCandidate(
        @JsonProperty("unitId") String unitId,
        @JsonProperty("feasible") boolean feasible,
        @JsonProperty("blockingReasons") List<String> blockingReasons,
        @JsonProperty("eta") Instant eta,
        @JsonProperty("expiryMarginMinutes") int expiryMarginMinutes,
        @JsonProperty("transitMinutes") int transitMinutes,
        @JsonProperty("fromHospitalId") String fromHospitalId,
        @JsonProperty("toHospitalId") String toHospitalId
) {}
