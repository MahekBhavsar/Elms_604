import { ComponentFixture, TestBed } from '@angular/core/testing';

import { StaffViewStatus } from './staff-view-status';

describe('StaffViewStatus', () => {
  let component: StaffViewStatus;
  let fixture: ComponentFixture<StaffViewStatus>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [StaffViewStatus]
    })
    .compileComponents();

    fixture = TestBed.createComponent(StaffViewStatus);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
