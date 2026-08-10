"""Unit tests for get_all_zone_data_for_source_ids in app.routers.fba"""
import pytest
from datetime import date, datetime, timezone
from unittest.mock import AsyncMock, MagicMock, patch

from app.auto_spatial_advisory.process_hfi import RunType
from app.routers.fba import get_all_zone_data_for_source_ids
from wps_shared.db.models.auto_spatial_advisory import AdvisoryHFIWindSpeed, SFMSFuelType
from wps_shared.db.models.fuel_type_raster import FuelTypeRaster
from wps_shared.schemas.fba import HfiThreshold

FOR_DATE = date(2024, 7, 15)
RUN_DATETIME = datetime(2024, 7, 15, 12, tzinfo=timezone.utc)
ZONE_SOURCE_ID = "1"

mock_fuel_type_raster = FuelTypeRaster(
    id=1,
    year=2024,
    version=1,
    xsize=100,
    ysize=200,
    object_store_path="test/path",
    content_hash="abc123",
    create_timestamp=datetime(2024, 5, 1, tzinfo=timezone.utc),
)

mock_prev_fuel_type_raster = FuelTypeRaster(
    id=2,
    year=2023,
    version=1,
    xsize=100,
    ysize=200,
    object_store_path="test/path/prev",
    content_hash="def456",
    create_timestamp=datetime(2023, 5, 1, tzinfo=timezone.utc),
)

mock_hfi_thresholds = {1: HfiThreshold(id=1, description="4000 < hfi < 10000", name="advisory")}

mock_fuel_types = [SFMSFuelType(id=1, fuel_type_id=1, fuel_type_code="C2", description="test fuel type c2")]

# (critical_hour_start, critical_hour_end, fuel_type_id, threshold_id, area, fuel_area, percent_conifer)
SAMPLE_ROW = (9.0, 11.0, 1, 1, 50, 100, 1)


def make_session():
    return MagicMock()


def patch_common_deps(mocker):
    mocker.patch("app.routers.fba.get_all_sfms_fuel_type_records", return_value=mock_fuel_types)
    mocker.patch("app.routers.fba.get_all_hfi_thresholds_by_id", return_value=mock_hfi_thresholds)
    mocker.patch("app.routers.fba.get_min_wind_speed_hfi_thresholds", return_value={})
    mocker.patch("app.routers.fba.get_fuel_type_raster_by_year", return_value=mock_fuel_type_raster)


@pytest.mark.anyio
@pytest.mark.parametrize(
    "precomputed_rows",
    [
        pytest.param([SAMPLE_ROW], id="single_row"),
        pytest.param([SAMPLE_ROW, SAMPLE_ROW, SAMPLE_ROW], id="duplicate_rows"),
    ],
)
async def test_precomputed_rows_deduplicated_to_one_fuel_stat(mocker, precomputed_rows):
    """Duplicate rows from get_precomputed_stats_for_shapes are deduplicated to one fuel_area_stats entry."""
    patch_common_deps(mocker)
    mocker.patch(
        "app.routers.fba.get_precomputed_stats_for_shapes",
        return_value={int(ZONE_SOURCE_ID): precomputed_rows},
    )

    result = await get_all_zone_data_for_source_ids(
        make_session(), [ZONE_SOURCE_ID], RunType.FORECAST, FOR_DATE, RUN_DATETIME
    )

    assert 1 in result
    assert len(result[1].fuel_area_stats) == 1


@pytest.mark.anyio
@pytest.mark.parametrize(
    "first_precomputed_result",
    [
        pytest.param([], id="empty_list"),
        pytest.param(None, id="none_result"),
    ],
)
async def test_falls_back_to_prev_year_raster(mocker, first_precomputed_result):
    """Falls back to previous year's fuel raster when current year returns empty or None."""
    mocker.patch("app.routers.fba.get_all_sfms_fuel_type_records", return_value=mock_fuel_types)
    mocker.patch("app.routers.fba.get_all_hfi_thresholds_by_id", return_value=mock_hfi_thresholds)
    mocker.patch("app.routers.fba.get_min_wind_speed_hfi_thresholds", return_value={})
    mocker.patch(
        "app.routers.fba.get_fuel_type_raster_by_year",
        side_effect=[mock_fuel_type_raster, mock_prev_fuel_type_raster],
    )
    mocker.patch(
        "app.routers.fba.get_precomputed_stats_for_shapes",
        side_effect=[
            {} if first_precomputed_result is None else {int(ZONE_SOURCE_ID): first_precomputed_result},
            {int(ZONE_SOURCE_ID): [SAMPLE_ROW]},
        ],
    )

    result = await get_all_zone_data_for_source_ids(
        make_session(), [ZONE_SOURCE_ID], RunType.FORECAST, FOR_DATE, RUN_DATETIME
    )

    assert 1 in result
    assert len(result[1].fuel_area_stats) == 1


@pytest.mark.anyio
@patch("app.routers.fba.get_all_sfms_fuel_type_records", new_callable=AsyncMock, return_value=mock_fuel_types)
@patch("app.routers.fba.get_all_hfi_thresholds_by_id", new_callable=AsyncMock, return_value=mock_hfi_thresholds)
@patch("app.routers.fba.get_min_wind_speed_hfi_thresholds", new_callable=AsyncMock, return_value={})
async def test_no_data_for_either_year_returns_empty_fuel_stats(*_):
    """Returns an empty fuel_area_stats list when neither year has precomputed stats."""
    with patch("app.routers.fba.get_fuel_type_raster_by_year", new_callable=AsyncMock, side_effect=[mock_fuel_type_raster, mock_prev_fuel_type_raster]):
        with patch("app.routers.fba.get_precomputed_stats_for_shapes", new_callable=AsyncMock, side_effect=[{}, {}]):
            result = await get_all_zone_data_for_source_ids(
                make_session(), [ZONE_SOURCE_ID], RunType.FORECAST, FOR_DATE, RUN_DATETIME
            )

    assert 1 in result
    assert result[1].fuel_area_stats == []


@pytest.mark.anyio
@patch("app.routers.fba.get_all_sfms_fuel_type_records", new_callable=AsyncMock, return_value=mock_fuel_types)
@patch("app.routers.fba.get_fuel_type_raster_by_year", new_callable=AsyncMock, return_value=mock_fuel_type_raster)
@patch("app.routers.fba.get_all_hfi_thresholds_by_id", new_callable=AsyncMock, return_value={})
@patch("app.routers.fba.get_min_wind_speed_hfi_thresholds", new_callable=AsyncMock, return_value={})
@patch("app.routers.fba.get_precomputed_stats_for_shapes", new_callable=AsyncMock, return_value={int(ZONE_SOURCE_ID): [SAMPLE_ROW]})
async def test_missing_threshold_skips_row(*_):
    """Skips rows whose threshold_id is not in hfi_thresholds_by_id."""
    result = await get_all_zone_data_for_source_ids(
        make_session(), [ZONE_SOURCE_ID], RunType.FORECAST, FOR_DATE, RUN_DATETIME
    )
    assert 1 in result
    assert result[1].fuel_area_stats == []


@pytest.mark.anyio
@patch("app.routers.fba.get_all_sfms_fuel_type_records", new_callable=AsyncMock, return_value=mock_fuel_types)
@patch("app.routers.fba.get_fuel_type_raster_by_year", new_callable=AsyncMock, return_value=mock_fuel_type_raster)
@patch("app.routers.fba.get_all_hfi_thresholds_by_id", new_callable=AsyncMock, return_value=mock_hfi_thresholds)
@patch(
    "app.routers.fba.get_min_wind_speed_hfi_thresholds",
    new_callable=AsyncMock,
    return_value={
        1: (AdvisoryHFIWindSpeed(id=1, advisory_shape_id=1, threshold=1, run_parameters=1, min_wind_speed=5.0),)
    },
)
@patch("app.routers.fba.get_precomputed_stats_for_shapes", new_callable=AsyncMock, return_value={int(ZONE_SOURCE_ID): [SAMPLE_ROW]})
async def test_wind_stats_attached_to_correct_zone(*_):
    """Wind stats for a zone source ID are included in the corresponding FireZoneHFIStats."""
    result = await get_all_zone_data_for_source_ids(
        make_session(), [ZONE_SOURCE_ID], RunType.FORECAST, FOR_DATE, RUN_DATETIME
    )
    assert 1 in result
    assert len(result[1].min_wind_stats) == 1
    assert result[1].min_wind_stats[0].min_wind_speed == pytest.approx(5.0)


@pytest.mark.anyio
@patch("app.routers.fba.get_all_sfms_fuel_type_records", new_callable=AsyncMock, return_value=mock_fuel_types)
@patch("app.routers.fba.get_fuel_type_raster_by_year", new_callable=AsyncMock, return_value=mock_fuel_type_raster)
@patch("app.routers.fba.get_all_hfi_thresholds_by_id", new_callable=AsyncMock, return_value=mock_hfi_thresholds)
@patch("app.routers.fba.get_min_wind_speed_hfi_thresholds", new_callable=AsyncMock, return_value={})
@patch("app.routers.fba.get_precomputed_stats_for_shapes", new_callable=AsyncMock, return_value={int(ZONE_SOURCE_ID): [SAMPLE_ROW]})
async def test_zone_without_wind_speed_data_has_empty_min_wind_stats(*_):
    """Zones with no wind speed data in the response get an empty min_wind_stats list."""
    result = await get_all_zone_data_for_source_ids(
        make_session(), [ZONE_SOURCE_ID], RunType.FORECAST, FOR_DATE, RUN_DATETIME
    )
    assert 1 in result
    assert result[1].min_wind_stats == []


@pytest.mark.anyio
@patch("app.routers.fba.get_all_sfms_fuel_type_records", new_callable=AsyncMock, return_value=mock_fuel_types)
@patch("app.routers.fba.get_fuel_type_raster_by_year", new_callable=AsyncMock, return_value=mock_fuel_type_raster)
@patch("app.routers.fba.get_all_hfi_thresholds_by_id", new_callable=AsyncMock, return_value=mock_hfi_thresholds)
@patch("app.routers.fba.get_min_wind_speed_hfi_thresholds", new_callable=AsyncMock, return_value={})
@patch("app.routers.fba.get_precomputed_stats_for_shapes", new_callable=AsyncMock, return_value={})
async def test_empty_zone_source_ids_returns_empty_dict(mock_precomputed, *_):
    """Returns an empty dict when zone_source_ids is empty."""
    result = await get_all_zone_data_for_source_ids(make_session(), [], RunType.FORECAST, FOR_DATE, RUN_DATETIME)
    assert result == {}
    mock_precomputed.assert_called_once()


@pytest.mark.anyio
async def test_stats_fetched_in_a_single_call_for_many_zones(mocker):
    """All zones are fetched in one call rather than one call per zone."""
    patch_common_deps(mocker)
    zone_source_ids = [str(source_id) for source_id in range(1, 11)]
    mock_precomputed = mocker.patch(
        "app.routers.fba.get_precomputed_stats_for_shapes",
        return_value={int(source_id): [SAMPLE_ROW] for source_id in zone_source_ids},
    )

    result = await get_all_zone_data_for_source_ids(
        make_session(), zone_source_ids, RunType.FORECAST, FOR_DATE, RUN_DATETIME
    )

    assert len(result) == len(zone_source_ids)
    assert mock_precomputed.call_count == 1
    assert mock_precomputed.call_args.kwargs["source_identifiers"] == zone_source_ids


@pytest.mark.anyio
async def test_previous_year_fallback_fetched_in_a_single_call(mocker):
    """Zones missing current year data share one fallback call for the previous year."""
    mocker.patch("app.routers.fba.get_all_sfms_fuel_type_records", return_value=mock_fuel_types)
    mocker.patch("app.routers.fba.get_all_hfi_thresholds_by_id", return_value=mock_hfi_thresholds)
    mocker.patch("app.routers.fba.get_min_wind_speed_hfi_thresholds", return_value={})
    mocker.patch(
        "app.routers.fba.get_fuel_type_raster_by_year",
        side_effect=[mock_fuel_type_raster, mock_prev_fuel_type_raster],
    )
    zone_source_ids = ["1", "2", "3"]
    mock_precomputed = mocker.patch(
        "app.routers.fba.get_precomputed_stats_for_shapes",
        side_effect=[{1: [SAMPLE_ROW]}, {2: [SAMPLE_ROW], 3: [SAMPLE_ROW]}],
    )

    result = await get_all_zone_data_for_source_ids(
        make_session(), zone_source_ids, RunType.FORECAST, FOR_DATE, RUN_DATETIME
    )

    assert mock_precomputed.call_count == 2
    assert mock_precomputed.call_args.kwargs["source_identifiers"] == ["2", "3"]
    for source_id in (1, 2, 3):
        assert len(result[source_id].fuel_area_stats) == 1
