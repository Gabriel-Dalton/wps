# Dev container image for the wps backend workspace.
#
# Based on the same GDAL image the production API base uses
# (openshift/wps-api-base/docker/Dockerfile) so the system libgdal matches the
# `gdal==3.13.1` pin in backend/packages/*/pyproject.toml. Distro-packaged GDAL
# is not new enough: Ubuntu 24.04 ships libgdal-dev 3.8.4.
FROM ghcr.io/osgeo/gdal:ubuntu-full-3.13.1

ENV DEBIAN_FRONTEND=noninteractive

# System dependencies, mirroring the production base image plus the bits only
# needed for local development and the test suite:
# - python3-dev, build-essential, cmake : building the gdal + psycopg2 extensions
# - libpq-dev                           : psycopg2 (wps-api pins the source build)
# - libudunits2-dev                     : cffdrs
# - default-jdk                         : pyjnius, for the RedAPP comparison tests
# - libeccodes-dev                      : weather model (GRIB) tests
# - postgresql-client, redis-tools      : talking to the db/redis service containers
RUN apt-get update --fix-missing && apt-get -y install --no-install-recommends \
    python3 python3-pip python3-dev python-is-python3 \
    build-essential cmake git curl ca-certificates \
    libproj-dev libgeos-dev libsqlite3-dev libxml2-dev libpq-dev \
    libudunits2-dev libeccodes-dev default-jdk \
    postgresql-client redis-tools \
    && rm -rf /var/lib/apt/lists/*

# uv replaced poetry as the workspace package manager.
COPY --from=ghcr.io/astral-sh/uv:0.9.11 /uv /uvx /bin/

# Unlike the production image this runs as root. A dev container is a workstation,
# not a deployed workload, and the non-root `worker` user only creates ownership
# mismatches against the mounted workspace.
ENV PYTHONPYCACHEPREFIX=python_cache
