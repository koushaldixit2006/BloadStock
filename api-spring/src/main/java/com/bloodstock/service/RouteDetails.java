package com.bloodstock.service;

public record RouteDetails(
        int dispatchBuffer,
        int transitMinutes,
        boolean routeUp,
        String errorReason
) {}
